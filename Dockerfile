# Dockerfile for MERN Backend with Native C Dependency

# --- Base Image ---
# Use an official Node.js image based on Debian Bullseye (common & stable)
# Choose a version compatible with your project (e.g., 18 LTS)
FROM node:22-bullseye




# --- Install C Dependencies for keygen ---
# Update package list, install essential C build tools and specific libraries, cleanup afterward
# libssl-dev for crypto, libgmp-dev for large numbers, libpbc-dev for pairing-based crypto
# ca-certificates allows Node.js to make secure HTTPS/TLS connections (e.g., to MongoDB Atlas, SMTP)

# --- Install C Dependencies for keygen ---
    RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    libgmp-dev \
    libssl-dev \
    ca-certificates \
    curl \
    tar \
    file \
    bison \      
    flex \        
    && rm -rf /var/lib/apt/lists/*
# --- Download and Install PBC ---
    ENV PBC_VERSION=0.5.14
    # Remove the 'v' prefix from the URL
    ENV PBC_TAR_URL=https://github.com/blynn/pbc/archive/refs/tags/${PBC_VERSION}.tar.gz
    # Rest of the configuration remains the same
    ENV PBC_DOWNLOAD_PATH=/tmp/pbc.tar.gz
    ENV PBC_EXTRACT_DIR=/tmp
    ENV PBC_SOURCE_DIR=/tmp/pbc-${PBC_VERSION}
    

# --- Application Setup ---
# Set the working directory inside the container
WORKDIR /app

# --- Copy C Source Code FIRST ---
# Adjust the source path 'crypto-c/src' if yours is different
COPY crypto-c/src /app/crypto-src/

# --- Copy Native Parameters ---
# Adjust source path 'server/opt/crypto-native' if needed
# Ensure these are copied relative to the WORKDIR /app
COPY server/opt/crypto-native/a.param /app/crypto-src/
COPY server/opt/crypto-native/master_secret_key.dat /app/crypto-src/

# --- Compile keygen INSIDE Docker ---
# Adjust source files (keygen.c etc.) and paths if necessary
# Add include/lib paths for PBC/GMP if they were installed to /usr/local
# -Wl,-rpath tells the linker where to find shared libs at runtime
RUN echo "Compiling keygen..." && \
    gcc /app/crypto-src/keygen.c /app/crypto-src/ibe.c /app/crypto-src/bls_ibe_util.c \
    -o /app/crypto-src/keygen \
    -I/usr/local/include/pbc -L/usr/local/lib \
    -Wl,-rpath=/usr/local/lib \
    -lpbc -lgmp -lssl -lcrypto \
    && echo "Compilation successful."

# --- Prepare final directory for native executable and params ---
RUN mkdir -p /app/opt/crypto-native && \
    # Move the compiled executable
    mv /app/crypto-src/keygen /app/opt/crypto-native/keygen && \
    # Move the parameters
    mv /app/crypto-src/a.param /app/opt/crypto-native/a.param && \
    mv /app/crypto-src/master_secret_key.dat /app/opt/crypto-native/master_secret_key.dat && \
    # Make executable
    chmod +x /app/opt/crypto-native/keygen && \
    # Clean up source
    rm -rf /app/crypto-src

# --- Node.js App Setup ---
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
# REMOVED: COPY server/opt/crypto-native ... (it's built/moved above now)
# REMOVED: RUN chmod +x ... (done above now)

# --- Environment Variables ---
ENV NODE_ENV=production
ENV PORT=5006
ENV NATIVE_CRYPTO_DIR=/app/opt/crypto-native 
ENV USER_KEYS_DIR=/app/opt/crypto-keys     
# Create the key storage directory if it doesn't exist
RUN mkdir -p ${USER_KEYS_DIR} && chmod 700 ${USER_KEYS_DIR} # Create and restrict permissions

# --- Expose Port / Start Command ---
EXPOSE 5006
CMD [ "node", "server.js" ]

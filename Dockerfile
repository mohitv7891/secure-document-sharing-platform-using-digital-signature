# Dockerfile for MERN Backend with Native C Dependency

# --- Base Image ---
# Use an official Node.js image based on Debian Bullseye (common & stable)
# Choose a version compatible with your project (e.g., 18 LTS)
FROM node:22-bullseye




# --- Install C Dependencies for keygen ---
# Update package list, install essential C build tools and specific libraries, cleanup afterward
# libssl-dev for crypto, libgmp-dev for large numbers, libpbc-dev for pairing-based crypto
# ca-certificates allows Node.js to make secure HTTPS/TLS connections (e.g., to MongoDB Atlas, SMTP)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    libgmp-dev \
    libpbc-dev \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Application Setup ---
# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json from the server directory first
# This leverages Docker layer caching - dependencies only reinstall if these files change
COPY server/package*.json ./

# Install Node.js dependencies for production
# --omit=dev skips development dependencies, reducing image size
RUN npm install --omit=dev

# Copy the rest of the backend server code into the container's working directory
COPY server/ ./

# Copy the native crypto directory into the container
# Ensure these files exist relative to the Dockerfile build context (project root)
COPY server/opt/crypto-native ./opt/crypto-native

# --- Permissions ---
# Make the keygen executable runnable inside the container
RUN chmod +x /app/opt/crypto-native/keygen

# --- Environment Variables ---
# Set Node environment to production
ENV NODE_ENV=production
# Set default port (Render can override this via its own PORT env var)
ENV PORT=5006
# Set paths for crypto operations *inside the container*
# Your Node.js code (e.g., executeKeygen.js) MUST use these ENV vars
ENV NATIVE_CRYPTO_DIR=/app/opt/crypto-native
# USER_KEYS_DIR isn't used for storage, but executeKeygen might use it for temp path before deleting
# Let's keep it pointing inside the native dir to avoid permission issues elsewhere
# Keys are written & deleted here
ENV USER_KEYS_DIR=/app/opt/crypto-native 

# --- Expose Port ---
# Tell Docker the container listens on this port (must match ENV PORT if used)
EXPOSE 5006

# --- Start Command ---
# The command to run when the container starts
CMD [ "node", "server.js" ]
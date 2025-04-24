# Dockerfile for MERN Backend with Native C Dependency

# --- Base Image ---
    FROM node:22-bullseye

    # --- Install C Dependencies and Build Tools ---
    # Includes build-essential, libs for GMP/SSL, tools for downloading/building PBC
    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
        build-essential \
        libgmp-dev \
        libssl-dev \
        ca-certificates \
        curl \
        tar \
        flex \  
        bison \ 
        && rm -rf /var/lib/apt/lists/*
    
    # --- Download, Build, and Install PBC from Source ---
    ENV PBC_VERSION=0.5.14
    ENV PBC_TAR_URL=https://github.com/blynn/pbc/archive/refs/tags/v${PBC_VERSION}.tar.gz
    ENV PBC_DOWNLOAD_PATH=/tmp/pbc.tar.gz
    ENV PBC_EXTRACT_DIR=/tmp
    ENV PBC_SOURCE_DIR=/tmp/pbc-${PBC_VERSION}
    
    # Use curl -L to follow redirects, -f to fail on server errors, -o to specify output
    RUN echo "Downloading PBC ${PBC_VERSION} from ${PBC_TAR_URL}..." && \
        curl -fL "${PBC_TAR_URL}" -o "${PBC_DOWNLOAD_PATH}" && \
        echo "Extracting PBC..." && \
        tar -xzf "${PBC_DOWNLOAD_PATH}" -C "${PBC_EXTRACT_DIR}" && \
        echo "Configuring PBC..." && \
        cd "${PBC_SOURCE_DIR}" && \
        ./configure && \
        echo "Building PBC..." && \
        make && \
        echo "Installing PBC..." && \
        make install && \
        echo "Updating library cache..." && \
        ldconfig && \
        echo "Cleaning up PBC source..." && \
        rm -rf "${PBC_DOWNLOAD_PATH}" "${PBC_SOURCE_DIR}"
    
    # --- Application Setup ---
    WORKDIR /app
    
    # --- Copy C Source Code (Your Project's Code) ---
    # Adjust the source path 'crypto-c/src' if yours is different
    COPY crypto-c/src /app/crypto-src/
    
    # --- Copy Native Parameters ---
    # Adjust source path 'server/opt/crypto-native' if needed
    COPY server/opt/crypto-native/a.param /app/crypto-src/
    COPY server/opt/crypto-native/master_secret_key.dat /app/crypto-src/
    
    # --- Compile YOUR keygen executable INSIDE Docker ---
    # This runs AFTER PBC has been installed by the block above
    RUN echo "Compiling keygen..." && \
        gcc /app/crypto-src/keygen.c /app/crypto-src/ibe.c /app/crypto-src/bls_ibe_util.c \
        -o /app/crypto-src/keygen \
        -I/usr/local/include/pbc -L/usr/local/lib \
        -Wl,-rpath=/usr/local/lib \
        -lpbc -lgmp -lssl -lcrypto \
        && echo "Keygen compilation successful."
    
    # --- Prepare final directory for native executable and params ---
    RUN mkdir -p /app/opt/crypto-native && \
        mv /app/crypto-src/keygen /app/opt/crypto-native/keygen && \
        mv /app/crypto-src/a.param /app/opt/crypto-native/a.param && \
        mv /app/crypto-src/master_secret_key.dat /app/opt/crypto-native/master_secret_key.dat && \
        chmod +x /app/opt/crypto-native/keygen && \
        rm -rf /app/crypto-src
    
    # --- Node.js App Setup ---
    COPY server/package*.json ./
    RUN npm install --omit=dev
    COPY server/ ./
    
    # --- Environment Variables ---
    ENV NODE_ENV=production
    ENV PORT=5006
    ENV NATIVE_CRYPTO_DIR=/app/opt/crypto-native
    ENV USER_KEYS_DIR=/app/opt/crypto-keys
    # Create the key storage directory for persistent keys (if using that model)
    RUN mkdir -p ${USER_KEYS_DIR} && chmod 700 ${USER_KEYS_DIR}
    
    # --- Expose Port / Start Command ---
    EXPOSE 5006
    CMD [ "node", "server.js" ]

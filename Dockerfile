# Use Node.js with Python support
FROM node:18-slim

# Install Python, pip, ffmpeg, and yt-dlp for social media processing
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN python3 --version && \
    yt-dlp --version && \
    ffmpeg -version

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create temp directory for video processing
RUN mkdir -p /tmp/social-media-processing && \
    chmod 755 /tmp/social-media-processing

# Create non-root user and set permissions
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app && \
    chown -R appuser:appuser /tmp/social-media-processing

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

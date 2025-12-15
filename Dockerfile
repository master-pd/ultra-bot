# Base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p data/logs data/fun-json data/admin-photos backups config assets

# Set environment variables
ENV NODE_ENV=production
ENV BOT_PREFIX="!"
ENV BOT_OWNER="61578706761898"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port (if needed)
# EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('fs').existsSync('/app/data/logs/health.check') || process.exit(1)"

# Start command
CMD ["node", "main.js"]
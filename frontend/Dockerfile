# Multi-stage build for React frontend
FROM node:20-alpine AS build

ENV CI=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies for build)
# Use BuildKit cache mount for faster npm installs
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --progress=false

# Copy source code
COPY . .

# Build the application with cache mounts for faster rebuilds
# Cache TypeScript build info and Vite cache
RUN --mount=type=cache,target=/app/node_modules/.vite \
    --mount=type=cache,target=/app/node_modules/.cache \
    npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port (nginx listens on 80 inside container, mapped to 8080 on host)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://127.0.0.1:80/ || exit 1

# Entrypoint injects optional env vars (e.g. ANALYTICS_SCRIPT) into index.html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

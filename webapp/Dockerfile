# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets. Includes /config.js as a placeholder stub — the
# entrypoint script below rewrites it with the real token at startup.
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config for SPA routing and /api proxy.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Runtime config injection. The nginx:alpine base image executes every
# *.sh file in /docker-entrypoint.d/ before starting nginx, so dropping
# this script in is enough — no ENTRYPOINT override needed.
COPY docker/40-journal-config.sh /docker-entrypoint.d/40-journal-config.sh
RUN chmod +x /docker-entrypoint.d/40-journal-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies (ci for clean install based on lockfile)
RUN npm ci

# Copy source files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Security hardening (optional but good practice)
# RUN rm -rf /etc/nginx/conf.d/default.conf  <-- We overwrote this anyway

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

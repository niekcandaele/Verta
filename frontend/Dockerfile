FROM node:24-alpine AS base

WORKDIR /app

# Development stage with hot-reload support
FROM base AS dev
ENV NODE_ENV=development

# Copy workspace root package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared-types/package*.json ./shared-types/

# Install all dependencies including workspaces
RUN npm ci --workspaces

# Copy application code
COPY frontend ./frontend
COPY shared-types ./shared-types

WORKDIR /app/frontend

# Expose Next.js development server port
EXPOSE 3000

# Start development server with hot-reload
CMD ["npm", "run", "dev"]

# Dependencies stage - install ALL dependencies for build
FROM base AS deps
# Copy workspace package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared-types/package*.json ./shared-types/

# Install dependencies including workspaces
RUN npm ci --workspaces

# Build stage
FROM base AS build
# Copy workspace package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared-types/package*.json ./shared-types/

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
# shared-types might not have node_modules if it has no runtime dependencies

# Copy source code
COPY frontend ./frontend
COPY shared-types ./shared-types

# Build shared-types first
WORKDIR /app/shared-types
RUN npm run build

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Production runtime stage
FROM base AS runtime
ENV NODE_ENV=production

# Copy workspace package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY shared-types/package*.json ./shared-types/

# Install production dependencies only
RUN npm ci --production --workspaces && npm cache clean --force

# Copy built shared-types
COPY --from=build /app/shared-types/dist ./shared-types/dist
COPY --from=build /app/shared-types/package.json ./shared-types/

# Copy built frontend application
COPY --from=build /app/frontend/.next ./frontend/.next
COPY --from=build /app/frontend/public ./frontend/public

WORKDIR /app/frontend

# Expose production server port
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
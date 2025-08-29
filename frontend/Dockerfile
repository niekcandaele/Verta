FROM node:24-alpine AS base

WORKDIR /app

# Development stage with hot-reload support
FROM base AS dev
ENV NODE_ENV=development

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose Next.js development server port
EXPOSE 3000

# Start development server with hot-reload
CMD ["npm", "run", "dev"]

# Production dependencies stage
FROM base AS deps
COPY package*.json ./
RUN npm ci --production

# Build stage
FROM base AS build
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production runtime stage
FROM base AS runtime
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production && npm cache clean --force

# Copy built application
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

# Expose production server port
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
FROM node:24-alpine AS base

# Install mysql client for init container
RUN apk add --no-cache mysql-client

WORKDIR /app

FROM base AS deps
# Copy workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared-types/package*.json ./shared-types/

# Install all dependencies including workspaces
RUN npm ci --workspaces

FROM base AS build
# Copy workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared-types/package*.json ./shared-types/

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
# shared-types might not have node_modules if it has no runtime dependencies

# Copy source code
COPY backend ./backend
COPY shared-types ./shared-types

# Build shared-types first
WORKDIR /app/shared-types
RUN npm run build

# Build backend
WORKDIR /app/backend
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production

# Copy workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared-types/package*.json ./shared-types/

# Install production dependencies only
RUN npm ci --production --workspaces && npm cache clean --force

# Copy built shared-types
COPY --from=build /app/shared-types/dist ./shared-types/dist
COPY --from=build /app/shared-types/package.json ./shared-types/

# Copy built backend application
COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend

EXPOSE 25000

CMD ["node", "dist/index.js"]

FROM base AS dev
ENV NODE_ENV=development

# Copy workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared-types/package*.json ./shared-types/

# Install all dependencies including workspaces
RUN npm install --workspaces

# Copy source code
COPY backend ./backend
COPY shared-types ./shared-types

WORKDIR /app/backend

EXPOSE 25000

CMD ["npm", "run", "dev"]
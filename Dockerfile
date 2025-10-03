# --- FRONTEND BUILD STAGE 🚀 ---
FROM node:22-alpine AS frontend_builder

WORKDIR /app/frontend

# Copy project package files
COPY package*.json ./

# Install dependencies including Vite
RUN npm install

# Copy index.html explicitly
COPY src/frontend/index.html ./

# Copy public folder
COPY src/frontend/public/ ./public

# Copy frontend source (excluding public + index.html to avoid overwrite)
COPY src/frontend ./src

# Build frontend with Vite
RUN npm run build:frontend

# ----------------------------------------------------------------------
# --- BACKEND BUILD STAGE 🚀 ---
FROM node:22-alpine AS backend_builder

WORKDIR /app/backend

# Copy package files and install all dependencies (includes tsc)
COPY package*.json ./
RUN npm install

# Copy tsconfig and backend source
COPY tsconfig.json ./
COPY src/backend ./src

# Build backend (TypeScript compiler)
RUN npm run build:backend

# Remove dev dependencies for lean production image
RUN npm prune --production

# ----------------------------------------------------------------------
# --- FINAL STAGE ---
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy production dependencies
COPY --from=backend_builder /app/backend/node_modules ./node_modules

# Copy built backend
COPY --from=backend_builder /app/backend/dist ./dist

# Copy built frontend (Vite outputs to 'dist' by default)
COPY --from=frontend_builder /app/frontend/dist ./public

# Expose port
EXPOSE 5000

# Start backend server
CMD ["node", "dist/server.js"]

FROM node:22-slim

WORKDIR /app

# Install pnpm in the same layer it will be used
RUN npm install -g pnpm@10.4.1

# Copy dependency manifests AND patches before install
# (pnpm requires patches/ to exist when pnpm-lock.yaml references them)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build frontend (Vite) + backend (esbuild)
RUN pnpm build

# Expose the port Railway injects via $PORT
EXPOSE 3000

ENV NODE_ENV=production

CMD ["pnpm", "start"]

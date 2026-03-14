FROM node:22-slim

RUN npm install -g pnpm@10.28.0

WORKDIR /app

# Copy graph-server files (build context is graph-server/)
COPY package.json ./
COPY src ./src
COPY tsconfig.json ./

# Install dependencies (no lockfile since context is graph-server/ only)
RUN pnpm install --no-frozen-lockfile

EXPOSE 8080

CMD ["node", "--import", "tsx", "src/server/container-entry.ts"]

Something else here in a different area

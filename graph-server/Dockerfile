FROM node:22-slim

RUN npm install -g pnpm@10.28.0

WORKDIR /app

# Copy monorepo root files needed for install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy graph-server package.json
COPY graph-server/package.json graph-server/

# Install dependencies
RUN cd graph-server && pnpm install --frozen-lockfile

# Copy source
COPY graph-server/src graph-server/src
COPY graph-server/tsconfig.json graph-server/

WORKDIR /app/graph-server

EXPOSE 8080

CMD ["node", "--import", "tsx", "src/server/container-entry.ts"]

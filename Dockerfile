# ── Stage 1: build frontend ──
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY vite.config.ts tsconfig.json ./

RUN bun run build

# ── Stage 2: runtime ──
FROM oven/bun:1-slim

# Docker CLI needed for rebuild/remove via `docker compose`
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/dist/ dist/
COPY --from=build /app/src/server/ src/server/
COPY --from=build /app/src/shared/ src/shared/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/package.json package.json

EXPOSE 9470

CMD ["bun", "run", "src/server/index.ts", "--all"]

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api-server/package.json apps/api-server/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY apps/api-server apps/api-server
COPY packages packages

RUN pnpm --filter api-server build
RUN pnpm --filter api-server exec tsc -p tsconfig.seed.json
RUN pnpm --filter api-server deploy --legacy /prod/api-server

FROM node:22-bookworm-slim AS runner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=development

WORKDIR /app

RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl

COPY --from=build /prod/api-server ./
COPY --from=build /app/apps/api-server/dist ./dist
COPY --from=build /app/apps/api-server/.seed-dist ./.seed-dist
COPY --from=build /app/apps/api-server/prisma ./prisma
COPY --from=build /app/apps/api-server/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/apps/api-server/prisma-database-url.ts ./prisma-database-url.ts

EXPOSE 3000

CMD ["node", "dist/main.js"]

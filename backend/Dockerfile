FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate \
  && pnpm build \
  && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.7.0 --activate

COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/test ./test
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts

USER node
EXPOSE 3001
CMD ["sh", "scripts/render-entrypoint.sh"]

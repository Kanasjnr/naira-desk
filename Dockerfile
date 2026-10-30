# The agent and the indexer in one container, sharing one disk for their logs and database.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agent/package.json apps/agent/
COPY apps/indexer/package.json apps/indexer/
COPY packages/chain/package.json packages/chain/
COPY packages/intel/package.json packages/intel/
COPY packages/pricing/package.json packages/pricing/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter "./apps/agent..." --filter "./apps/indexer..."

COPY apps/agent/src apps/agent/src
COPY apps/indexer/src apps/indexer/src
COPY packages packages
COPY deploy/start.sh deploy/start.sh

# dataFile() keeps everything under $HOME/.naira-desk, so HOME is the mounted volume.
ENV HOME=/data \
    FEED_HOST=0.0.0.0 \
    API_HOST=0.0.0.0 \
    INDEXER_HOST=0.0.0.0
EXPOSE 8787 8788 8789

CMD ["bash", "deploy/start.sh"]

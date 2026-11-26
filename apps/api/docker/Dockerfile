FROM node:26-alpine

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["pnpm", "dev"]

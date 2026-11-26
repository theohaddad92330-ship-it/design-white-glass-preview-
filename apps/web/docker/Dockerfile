FROM node:26-alpine

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]

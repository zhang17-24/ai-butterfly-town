# 单服务托管 Web 静态文件 + REST + WebSocket + 轻量仿真 Worker + 生图 Job。
# 分层结构:仅清单文件变化才重装依赖(代码变更不重跑 pnpm install)。
FROM node:20-bookworm-slim

RUN corepack enable
WORKDIR /app

# better-sqlite3 为原生模块,预编译不可用时需要构建工具链
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# 先只拷贝清单文件,构建依赖层(有缓存)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# 依赖缓存命中后再全量拷贝并构建
COPY . .
RUN pnpm -r build

ENV NODE_ENV=production \
    SERVE_WEB=1 \
    PORT=3100 \
    DATABASE_PATH=/app/data/ai-town.db

RUN mkdir -p /app/data
EXPOSE 3100

CMD ["node", "apps/server/dist/index.js"]

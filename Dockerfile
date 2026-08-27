# 单服务托管 Web 静态文件 + REST + WebSocket + 轻量仿真 Worker。
# 注意:生产运行时依赖 packages/shared 以 dist 而非 src 导出;
# 该隐患未解决前,容器化启动可能失败,见 docs/agents/agent-claude-2026-08-28-m9-delivery.plan.md §4。
FROM node:20-bookworm-slim

RUN corepack enable
WORKDIR /app

# better-sqlite3 为原生模块,预编译不可用时需要构建工具链
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY . .
RUN pnpm install --frozen-lockfile && pnpm -r build

ENV NODE_ENV=production \
    SERVE_WEB=1 \
    PORT=3100 \
    DATABASE_PATH=/app/data/ai-town.db

RUN mkdir -p /app/data
EXPOSE 3100

CMD ["node", "apps/server/dist/index.js"]

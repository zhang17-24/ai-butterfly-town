# AI 蝴蝶小镇

一个持续自主运行的 Web AI 小镇。M1–M4 已经贯通（含玩家 A* 移动与 NPC 对话），并加入首个视觉生成纵向切片：账号登录、内置栖溪镇、5 名完整居民、真实 AI/Mock 自主决策、结构化校验与修复、可解释 Trace、原创像素地图、程序化像素居民、版本化世界命令、WebSocket 恢复，以及 SQLite 保存恢复。

项目需求以 **Living Requirement Map v1.5（D01–D132）** 为基线；D125–D132 记录开发路线、参考边界与当前实装顺序，不扩大面试 MVP 的产品范围。

## 当前可体验内容

- 使用演示账号登录并进入世界库；
- 进入现代滨河社区“栖溪镇”；
- 观察 5 名性格、职业和状态不同的居民自主行动；
- 点击地图居民，查看人设、动机、动态状态与行动原因；
- 暂停或继续世界；
- 刷新页面后从 SQLite 恢复世界时间、居民状态和事件流；
- 删除全部 AI Key 仍可完整体验（当前默认就是 Mock 模式）。
- 配置 SIMULATION AI 后查看真实模型选择；模型超时、坏输出或调用预算耗尽时自动降级。
- 体验原创的栖溪镇像素地图；IMAGE/VISION 未配置时自动使用预生成地图和程序化居民。
- 作为居民点击道路移动；路径由服务端 Blueprint 网格与 A* 校验，河流和建筑目标会被拒绝，刷新后位置恢复。
- **NPC 沿 A* 路径逐格行走**（跨桥、绕行建筑），地图顶栏“行走区域”按钮可切换 Blueprint 可走范围的高亮叠加层。
- **居民使用 Seedream 5.0 生成的 6×5 像素精灵表**（左/前/背行走循环 + 待机帧），生成脚本与两类资产已入库；无图片时回退程序化像素人。
  ```bash
  pnpm generate:sprites          # 生成全部；或 pnpm generate:sprites npc_lin_xia 生成单个
  ```

M2 提供旧库迁移、版本冲突、幂等、事务回滚和断线恢复。M3 在此基础上加入 OpenAI-compatible Responses/Chat Provider、受限候选选择、一次校验修复、两次请求尝试、每 Tick 调用预算和与世界状态同事务保存的 AI Trace。

## 本地启动

要求：Node.js 20+、pnpm 10+。

```bash
cp .env.example .env
pnpm install
pnpm dev
```

打开 <http://localhost:3200>，使用：

```text
账号：demo
密码：town1234
```

服务端默认运行于 `http://localhost:3100`。开发模式下 Vite 会代理 `/api` 与 `/ws`。

## 自动化验证

```bash
pnpm verify
```

该命令执行类型检查、离线测试和生产构建。测试无需网络与 AI Key。

### 交付 / CI / Docker

- CI：`.github/workflows/ci.yml` 在 push/PR 时执行 `pnpm install && pnpm typecheck && pnpm test && pnpm build`。
- 交付检查：`pnpm delivery:check` 先跑 `pnpm verify`，再输出人工确认清单（线上 URL、演示账号、AI 限额、视频等）。
- Docker：`Dockerfile` + `docker-compose.yml` 单服务托管 Web 静态文件、REST、WebSocket 与仿真 Worker，开放 `http://localhost:3100`，数据库挂载到 `ai-town-data` 卷。

```bash
cp .env.example .env   # 填入 DeepSeek / Seedream 密钥(见文件内注释)
docker compose up --build -d
## 浏览器打开 http://localhost:3100,账号 demo / town1234
```

> 云部署已备好 `render.yaml`:**Render → New Blueprint → 选仓库 → 面板粘贴两个 API Key → Deploy**,一个容器解决全部服务(静态页 + REST + WebSocket + 仿真 Worker + 生图 Job)。免费实例去掉 `disk` 段;`AI_VISION_*` 留空自动回退像素统计审查。

> 已修复(D102):`packages/shared` 以 `dist`+类型导出,`node apps/server/dist/index.js` 单命令可跑(本地已以 `docker build` + 容器内登录/世界/首页冒烟验证)。
- `CI` 现已含 `pnpm lint`(eslint flat,typescript+react-hooks;0 error)。
- 一键自检:`pnpm verify`(lint+typecheck+test+build)、`pnpm test:e2e`(HTTP 冒烟 10 步)、`pnpm test:ai`(真实 DeepSeek 决策/对话 + Seedream 生图契约,已 3/3)。
- 部署与演示:**见 [docs/delivery.md](docs/delivery.md)** —— Render Blueprint 一键部署配置样例、面试官动线与 3–5 分钟录制脚本。密钥只放 `apps/server/.env`(gitignore),不留仓库。

## 设计与实现规划

- [技术方案](./docs/technical-design.md)：架构、领域模型、数据/API、AI/Mock、持久化、测试与部署取舍；
- [实现规划](./docs/implementation-plan.md)：Day 1 审计、Day 2/3 里程碑、验收矩阵、风险与裁剪顺序。
- [WorldX 生成研究](./docs/worldx-generation-study.md)：审阅范围、可借鉴机制、自有提示词与“蓝图权威”差异。

文档会明确区分“已实现、下一步实现、只预留接口”。M1–M4 与视觉生成纵向切片已完成；剩余项（M5 事件注入与因果链、M6 快照/分支/跳过、M7 接线、M8 工作台、M9 收尾见 [remaining-requirements.md](./docs/remaining-requirements.md)）。

## 工程结构

```text
apps/web             React + Phaser + TanStack Query + Zustand
apps/server          Fastify + SQLite/WAL + Drizzle + WebSocket
packages/shared      前后端共享 Zod Schema 与 TypeScript 类型
```

服务端是世界状态唯一权威。Mock 决策器依据居民需求、时段、性格特质和固定种子扰动选择行动；每次世界推进都在同一事务中保存世界版本、5 名居民状态和新事件，再通过 WebSocket 推送实时投影。

## 当前边界

M1–M9 主体已完成(M4 玩家移动与对话、M5 事件注入与两级因果链、M6 快照/跳过/分支、M7 一句话生成与记忆系统、M9 OpenAPI/E2E/lint/Docker)并可通过 `pnpm verify`(127 离线测试);剩余交付面(D103 线上地址、D104 演示视频等)见 docs/delivery.md 与剩余需求清单。

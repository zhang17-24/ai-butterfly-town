# AI 蝴蝶小镇

一个持续自主运行的 Web AI 小镇。Day 1 可玩切片和 M2 领域/持久化地基已经贯通：账号登录、内置栖溪镇、5 名完整居民、可解释 Mock 决策、版本化世界命令、默认时间线分支、初始快照、WebSocket 恢复，以及 SQLite 保存恢复。

项目需求以 **Living Requirement Map v1.3（D01–D124）** 为基线。v1.4 只用于记录实现进度，不扩大本轮产品范围。

## 当前可体验内容

- 使用演示账号登录并进入世界库；
- 进入现代滨河社区“栖溪镇”；
- 观察 5 名性格、职业和状态不同的居民自主行动；
- 点击地图居民，查看人设、动机、动态状态与行动原因；
- 暂停或继续世界；
- 刷新页面后从 SQLite 恢复世界时间、居民状态和事件流；
- 删除全部 AI Key 仍可完整体验（当前默认就是 Mock 模式）。

M2 新增的工程保障包括：旧 Day 1 数据库兼容迁移、世界版本冲突检测、命令幂等、事务失败整体回滚、带分支/版本的实时消息信封和断线恢复。它们主要保障后续 AI、玩家与事件功能共享同一个安全状态基础。

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

## 设计与实现规划

- [技术方案](./docs/technical-design.md)：架构、领域模型、数据/API、AI/Mock、持久化、测试与部署取舍；
- [实现规划](./docs/implementation-plan.md)：Day 1 审计、Day 2/3 里程碑、验收矩阵、风险与裁剪顺序。

两份文档会明确区分“已实现、下一步实现、只预留接口”。M2 已完成，下一开发里程碑为 M3“真实 AI 决策与可解释降级”。

## 工程结构

```text
apps/web             React + Phaser + TanStack Query + Zustand
apps/server          Fastify + SQLite/WAL + Drizzle + WebSocket
packages/shared      前后端共享 Zod Schema 与 TypeScript 类型
```

服务端是世界状态唯一权威。Mock 决策器依据居民需求、时段、性格特质和固定种子扰动选择行动；每次世界推进都在同一事务中保存世界版本、5 名居民状态和新事件，再通过 WebSocket 推送实时投影。

## 当前边界

这是三天路线图中的 M2 版本。真实 AI、玩家移动与对话、事件注入、因果链、历史分支操作、世界生成和 AI 调试工作台尚未实现，具体顺序与验收标准见实现规划。

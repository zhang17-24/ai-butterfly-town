# 计划文档 · M4-2 收尾与提交(C 会话接任者,2026-08-28)

## 1. 影响文件(申报清单)

**修改(本会话)**
- `packages/shared/src/index.ts`(DialogueReplyResultSchema + world/event)
- `apps/server/src/db/repository.ts`(sendDialogueMessage:事件+版本+trace 同事务)
- `apps/server/src/app.ts`(传 decided.trace;消息路由广播 world.status)
- `apps/server/src/app.test.ts`(集成断言 4 项)
- `docs/agents/README.md`(注册表 C 行状态)

**提交范围(含原 C 会话工作树,全部属 M4-2 对话区)**
- `apps/server/src/ai/dialogue-decider.*`、`provider.*`、`simulation-decider.*`(对话契约与接线)
- `apps/server/src/dialogue/`(Mock 人格模板)
- `apps/server/src/app.ts`、`db/repository.ts`、`db/schema.ts`、`db/database.ts`(+tests)
- `domain/seed.ts`、`domain/mock-decision.ts`(NPC 可达落点)、`generation/qixi-blueprint.ts`(共享导出)、`navigation/a-star.*`(findApproachPath/findNearestWalkable)、`simulation/simulation-service.ts`(对话锁+路径动画)
- `apps/web/src/game/TownScene.ts`、`pages/WorldPage.tsx`、`services/api.ts`、`state/world-store.ts`、`styles.css`
- `apps/web/public/assets/npcs/`(7 个精灵表 PNG:5 NPC+player;design-*.png 不被引用,不入仓)
- `apps/server/scripts/npc-designs.ts`、`generate-npc-sprites.ts`(Seedream 生成脚本)
- `packages/shared/src/navigation.ts`、`qixi-blueprint.ts`、`packages/shared/package.json`(exports 补齐)、`.env.example`(AI_IMAGE_* 配置)

**不碰/不 add(B/M7/D 区,留待各自会话提交)**
- `README.md`、根 `package.json`、`pnpm-lock.yaml`、`.github/`、`scripts/`、`Dockerfile`、`docker-compose.yml`、`.dockerignore`
- `apps/server/src/generation/world-structure.ts`、`world-generator.ts`(+tests)
- `apps/server/src/domain/event-propagation.*`、`event-preview.*`
- `docs/agents/` 中 A/B/D 会话的文档(只读)

## 2. 执行步骤

1. 勘察:确认 register/缺口、web typecheck 现状(结果:03:02 C 已修复 TownScene);
2. 改 Schema(repository 契约)→ 改 repository(单事务含事件/版本/trace)→ 改 app.ts;
3. 集成测试断言增强(4 项);
4. `pnpm verify` 全绿;
5. 只 add 申报清单提交 `feat: add npc dialogue sessions with ai and mock fallback`;
6. 更新注册表与执行文档(提交 hash/验证结果)。

## 3. 风险

- 世界版本递增可能影响仿真 tick 的 expectedVersion:SimulationService 快照后 commitTick 用世界内 version 校验;消息在 tick 间隙插入,commitTick 以当前读值为准,无需改;
- 广播 world.status 增加流量:对话消息量小,且对话 UI 本地更新为主,不影响;
- 共享 package.json exports 变更(B 声称 M9 风险与此相关):本次只增 export 子路径,不改变入口,兼容 src 导出现状。

# 执行文档 · claude E 会话(2026-08-28;切片:包 E — M6 纯逻辑 + M8/M7 页面组件)

## 0. 勘察记录

- 开始时 HEAD `87f70bf`;**会话进行中 M4-2 已提交**:`f7a7cc4 feat: add npc dialogue sessions with ai and mock fallback` + `71151d2 docs: record m4-2 submission in agent registry` → A 主线已解锁,与本次并行预期一致。
- 注册表(`docs/agents/README.md`)正在被大会话重写(03:16 快照),新版"当前会话"表**已预留 E 行**:`| E | M6 纯逻辑+页面组件(timeline/snapshot-logic.ts 已落地) | 进行中 |`。本会话未重复编辑注册表,未编辑 `remaining-work-map.md`(均属他会话工作树)。
- 既有修改(非本会话)保持在位:B 的 M9 工程件、D 的 domain 文件、C 的 M4-2 已提交、精灵图等;全部避让。

## 1. 本会话完成

| 项 | 结果 |
| --- | --- |
| 切片 | 包 E:M6 快照/跳过/分支纯逻辑 + M8 AI 工作台组件 + M7 创建页组件(全部新增文件) |
| 新增文件 | `apps/server/src/timeline/snapshot-logic.ts`、`snapshot-logic.test.ts`;`apps/web/src/pages/AiLabPage.tsx` + `AiLabPage.css`;`apps/web/src/pages/NewWorldPage.tsx` + `NewWorldPage.css`;`docs/agents/agent-e-2026-08-28-m6-m8-m7-parallel.{requirement,plan,execution}.md` |
| 修改文件 | **无**(既有文件零改动;串行区五件 + App.tsx 未触碰) |
| 单测 | `apps/server` 13 文件 67/67 全绿(新增 snapshot-logic 22 用例,离线) |
| 类型与构建 | `pnpm typecheck` 全仓绿(shared/web/server);`pnpm --filter @ai-town/web build` 通过(仅既有 Phaser 大包告警) |

## 2. 交付契约(供 A 接线消费)

- `shouldSnapshot(version, gameMinute, eventType, snapshotCount, {intervalMinutes?, majorEventTypes?, rollingCap?})` → `{ should, reason: "major_event"|"periodic"|"initial_state"|"cap_reached"|"normal" }`;
  规则顺序:重大事件(默认含 `factory_fire/flood/emergency/accident/power_outage`)→ 初始态(version≤0 或 minute≤0)→ 滚动上限(cap 96)→ 周期(默认 60 分钟边界)。
- `buildSkipSchedule(world: { gameMinute, currentActionEndsAtMinute?, events: [{id, gameMinute, type}] }, targetMinute, {emergencyEventTypes?})` → `{ steps: [{fromMinute,toMinute,kind:"advance"|"emergency_stop"|"arrive",atEventId?,atEventType?,reason}], plannedEndMinute, stoppedByEmergency, stopEventId, targetMinute }`;
  暂停点 = 当前动作结束 ∪ 未来事件(排序);紧急事件后不再规划,停在事件前一刻;事件乱序输入自动排序;目标不前进 → 空计划。
- `validateBranchRestore(snapshotChecksum, replayedChecksum)` → `{ ok, reason: "match"|"mismatch"|"checksum_missing" }`;另附 `computeSnapshotChecksum(input)`(FNV-1a 确定性,与 event-preview 同族)供"快照+回放投影"对齐。
- `AiLabPage`:`AiLabApi = { listTraces(filter?), listWorlds(), replay({traceId, writeBack, sandboxContext?}), compare({traceId, mode:"real"|"mock"}) }`;五过滤(世界/居民/角色/状态/来源,含"降级"=status fallback,与来源 ai/mock 分离);详情卡含上下文/候选/校验错误/降级原因/前后状态差异;重放默认 writeBack=false;对比输出 original vs replay 双列 + verdict。默认导出 + `mockApi`(纯内存)。
- `NewWorldPage`:`NewWorldApi = { createWorld({prompt, population, style}), getJob(jobId) }`;`GENERATION_STAGES` 六阶段常量;`mockApi.getJob` 每轮轮询推进一阶段(1200ms)直至 success(worldId=`world_mock_qixi`)。

## 3. 冗余与偏差记录

- 初版单测误用 480 分钟(恰为 60 边界)断言 `normal`,实为 `periodic`;已修正用例(被测逻辑未变)。
- AiLabPage 过滤器类型收窄:select 字符串值经 `as AiTrace["role"]` 等显式收窄,避免 TS2322。
- 测试用例数由计划预估 20+ 落为 22,覆盖任务要求四类(周期/重大/跳过/校验和)外加初始态、cap、乱序、缺失项。

## 4. 交付后待办(交由主线 A / 接任者)

1. M6 接线:`shouldSnapshot` 挂到事件提交后钩子、`buildSkipSchedule` 挂到 `POST /worlds/:id/skip`、`validateBranchRestore` 挂到分支恢复路由(与 `snapshots` 表、`POST /branches` 同批)。
2. M8 接线:按 `AiLabApi` 契约实现 `GET /ai/traces`、`POST /ai/replay`、`POST /ai/compare`(可复用现 `GET /agents/:id/decisions` 的 Trace 数据),替换页面注入的 `mockApi`;在 `apps/web/src/App.tsx` 登记 `/dev/ai`。
3. M7 接线:F 包实现 `POST /worlds`(或 `/generation/jobs`)与 `GET /generation/jobs/:id` 后,以真实 `api` 替换 `NewWorldPage` 注入的 `mockApi`;在 `App.tsx` 登记 `/worlds/new`(D100 六路由剩两条由 A 统一补)。
4. 浏览器回归(登录→移动→对话→工作台→创建页)按注册表约定留 A 主线,本会话未做。

## 5. 验证证据(手动记录)

```
pnpm --filter @ai-town/server test  → Test Files 13 passed;Tests 67 passed
pnpm typecheck                      → shared/web/server 全部 Done 无错误
pnpm --filter @ai-town/web build    → ✓ built(仅 chunk 大小告警,Phaser 已知债)
grep -n 'fetch|services/api' 新页面  → 仅注释命中(契约说明),无运行时调用
git status 既有文件 M/D 项           → 全部为他会话既有修改,本会话零新增
```

# 需求文档 · 包 E:M6 快照纯逻辑 + M8 AI 工作台组件 + M7 创建页组件(claude E 会话,2026-08-28)

- **Agent**:claude E 会话(并行开发会话,代号 E)
- **负责切片**:主线之外的"纯新增部件"——M6 快照/跳过/分支纯逻辑、M8 AI 工作台页面组件、M7 世界创建页组件
- **代码基线**:HEAD `87f70bf`(执行期间更新至 `71151d2`);`remaining-work-map.md` "包 E" 行

## 1. 需求来源

1. `docs/agents/remaining-work-map.md` 包 E:快照/跳过/分支纯逻辑 + M8 前端组件,可与 A 并行,全部新增文件;
2. `docs/technical-design.md` §7.2:每 60 世界分钟或重大事件后滚动快照、重启按快照+事件回放、校验一致性;
3. `docs/implementation-plan.md` §10 M6:周期/重大事件快照、跳过当前动作与下一事件、紧急事件自动停止、从旧节点恢复校验;
4. `docs/technical-design.md` §10.1:六路由中的 `/worlds/new`(一句话创建+高级设置+分阶段进度)与 `/dev/ai`(AI 调试工作台);
5. `docs/technical-design.md` §6.4:生成六阶段 `STRUCTURE/VALIDATE_STRUCTURE/GENERATE_ART/VISION_REVIEW/PATH_TEST/ASSEMBLE`;
6. M8 要求(技术方案 §9.4):Trace 查看、沙盒重放(默认不写回)、真实模型/Mock 对比。

## 2. 切片范围(三件)

1. `apps/server/src/timeline/snapshot-logic.ts`(纯函数+单测):
   - `shouldSnapshot(version, gameMinute, eventType, snapshotCount, options?)` → 周期(60 分钟)/重大事件(factory 类)触发判定;
   - `buildSkipSchedule(world, targetMinute, options?)` → 跳过推进计划,紧急事件自动停止;
   - `validateBranchRestore(snapshotChecksum, replayedChecksum)` → 校验和一致性判定;
   - 附 `computeSnapshotChecksum`(确定性 FNV-1a)供回放侧复用;
   - 单测覆盖:周期触发、重大事件触发、跳过逐事件推进到达目标、紧急停跳、乱序输入、校验和不一致/缺失拒绝、checksum 确定性。
2. `apps/web/src/pages/AiLabPage.tsx`:
   - Trace 列表(按世界/NPC/角色/状态/来源五种过滤)+ 详情卡片 + 沙盒重放表单 + AI vs Mock 对比卡片;
   - 契约收在页面顶部 `AiLabApi = { listTraces, replay, compare, listWorlds }` 类型常量(注明"由主线接线替换为 services/api 真实方法");
   - props 取 `{ api?: AiLabApi }`,默认导出并内置 `mockApi`(纯内存,便于本地预览)。
3. `apps/web/src/pages/NewWorldPage.tsx`:
   - 一句话输入 + 高级设置(人口规模/美术风格)+ 分阶段进度条 + 失败重试;
   - 契约 `NewWorldApi = { createWorld, getJob }` + 六阶段常量;
   - 同样默认导出并内置 `mockApi`。

## 3. 验收标准

1. `pnpm typecheck` 全绿(shared/web/server);
2. server `vitest` 新增用例全绿(离线,无网络/AI Key);
3. web 页面组件**不含运行时 API 调用**(只走注入的契约实例;`grep -E "fetch|services/api"` 仅命中注释);
4. 页面组件零未实现 import(无 `pages/` 之外的本地依赖,路由登记留给主线 A);
5. 只新增文件,不落一行到既有文件(串行区五件 + App.tsx 零改动)。

## 4. 边界(本切片不做)

- 不写库、不建表、不动 `packages/shared/src/index.ts`(快照 Schema 复用共享 `SnapshotMetadata` 类型,只读 import);
- 不做 REST/WebSocket 接线(路由归 A 的 M5/M6 串行链;`POST /ai/replay`、`POST /ai/compare` 尚不存在);
- 不做浏览器回归(Ego 无服务器支持,留 A 主线);
- 不改 `docs/agents/README.md`(重写中,已预留 E 行)、不碰 `remaining-work-map.md`(他会话协作面工作树)。

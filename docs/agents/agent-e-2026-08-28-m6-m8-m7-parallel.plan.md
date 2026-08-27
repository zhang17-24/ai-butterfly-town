# 执行计划 · 包 E:M6/M8/M7 纯新增部件(claude E 会话,2026-08-28)

## 0. 勘察结论

- 串行区五件(`packages/shared/src/index.ts`、`apps/server/src/db/*`、`apps/server/src/app.ts`、`apps/web/src/App.tsx`、根 `package.json`)本切片零接触(只读 import 例外:web 页面只 import `@ai-town/shared` 的 `AiTrace/WorldSummary` 类型)。
- 可复用先例:`domain/event-propagation.ts` 纯函数风格、`event-preview.ts` 的 FNV-1a hash、`HomePage.tsx` 页面骨架与 `services/api.ts` 的错误/契约风格。
- 技术方案 §7.2 已定义 `SnapshotMetadataSchema`(id/worldId/branchId/version/gameMinute/reason/checksum/createdAt)→ `validateBranchRestore` 直接以 checksum 字段为轴。
- M4-2 于本会话进行中提交(`f7a7cc4` 代码 + `71151d2` 注册表),A 主线已解锁;`remaining-work-map` 包 E 的"等待 C 提交"前置已解除,无阻塞。

## 1. 步骤

1. **snapshot-logic.ts + 单测**(先逻辑后页面):
   - `shouldSnapshot`:重大事件 > 初始态(version≤0 / minute≤0) > 滚动上限(cap) > 周期(minute%60) > normal;四大常量(60 分钟间隔、cap 96、MAJOR/EMERGENCY 类型含 `factory_fire`),全部可注入;
   - `buildSkipSchedule`:暂停点 = 当前动作结束 ∪ 未来事件(按分钟排序);紧急事件后不再规划,停在事件前一分钟(`emergency_stop`);无暂停点则单一 `arrive` 步直达目标;目标不前进返回空计划;
   - `validateBranchRestore`:空白校验和 → `checksum_missing` 拒绝;不等 → `mismatch` 拒绝;相等 → `match`;
   - 单测:周期/重大/初始/cap/注入选项;跳过常规/紧急停跳/动作结束点/空事件/目标在事件前/乱序;校验和一致/不一致/缺失/确定性。
2. **AiLabPage.tsx + .css**:契约类型块(顶部)+ 五过滤(世界/居民/角色/状态/来源)+ 卡片列表 + 详情卡(候选/上下文/原始输出/校验错误/降级原因/状态差异)+ 重放表单(默认不写回)+ 对比卡(原记录 vs Mock/同模型)+ `mockApi`(三条 Trace 含 fallback/ai/mock)。
3. **NewWorldPage.tsx + .css**:一句话输入 + 高级设置(人口 3/5/8/12/20、三风格)+ 六阶段进度条 + 成功进入链接 + 失败重试;`mockApi` 的 `getJob` 每次轮询推进一阶段直至成功。
4. **验证**:`pnpm --filter @ai-town/server test`、`pnpm typecheck`(全仓)、`pnpm --filter @ai-town/web build`。
5. **留痕与提交**:三篇 `agent-e-2026-08-28-*.md`;提交 `feat: add m6 snapshot logic and world dev pages components`。

## 2. 文件清单

新增:

| 文件 | 内容 |
| --- | --- |
| `apps/server/src/timeline/snapshot-logic.ts` | M6 纯判定/编排 |
| `apps/server/src/timeline/snapshot-logic.test.ts` | 20+ 用例 |
| `apps/web/src/pages/AiLabPage.tsx` + `AiLabPage.css` | M8 工作台组件 |
| `apps/web/src/pages/NewWorldPage.tsx` + `NewWorldPage.css` | M7 创建页组件 |
| `docs/agents/agent-e-2026-08-28-m6-m8-m7-parallel.{requirement,plan,execution}.md` | 痕迹 |

修改:无(既有文件零改动)。

## 3. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 与 A 主线并行时 tsconfig/锁文件竞争 | 只跑 typecheck/test/build 读取型命令,不跑 `pnpm install`、不改任何 lock/配置 |
| 注册表被大会话重写覆盖 | 不编辑 `docs/agents/README.md`;E 行已由重写者预留,仅在自身执行文档登记 |
| 契约与真实 API 偏移 | 契约显式标注"由主线接线替换";A 接线时按 `remaining-work-map` 包 E 判据替换并更新执行文档 |
| Web 页面无真实后端调试 | 组件零运行时调用 + `mockApi` 纯内存;浏览器回归明确留 A |

## 4. 完成判据

- server 测试全绿(新增用例通过)、`pnpm typecheck` 全绿、web build 通过(仅既有 Phaser 大包告警);
- 页面组件 grep 无 `fetch`/`services/api` 实际调用;
- `git diff` 对既有文件零输出(仅工作树他会话既有修改)。

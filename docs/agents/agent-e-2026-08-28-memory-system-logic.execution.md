# 执行文档 · 记忆系统纯函数层(包 E2,claude E 会话,2026-08-28)

## 0. 勘察记录

- HEAD 起点 `32e8059`(记忆系统设计 spec);设计文档含 Claude B 评审修正(§13):FTS5 缓用、`world_minute` 新近度基准、半衰期 1440、json_object 提示词约束、MVP 范围收敛——本切片严格按其执行;
- 本切片只实施 design spec §10.1「可立即并行(纯新增)」:"由接顺手会话(如 E 会话)先行"——即本会话;

## 1. 本会话完成

| 项 | 结果 |
| --- | --- |
| 切片 | 记忆系统纯函数层(§10.1 全部 5 个模块) |
| 新增文件 | `apps/server/src/memory/retrieval.ts`(+14 测试)、`importance.ts`(+8)、`summarize.ts`(+18)、`caption.ts`(+4)、`mock-decision-bonus.ts`(+6);执行文档三篇 |
| 修改文件 | **无**(既有文件零改动;串行区 `db/*`/`shared/index.ts`/`app.ts`/`App.tsx`/根 package.json 未触碰;`snapshot-logic.ts` 仅**只读 import** `MAJOR_EVENT_TYPES`) |
| 单测 | memory 50/50 绿;`apps/server` 全量 **19 文件 123/123 绿**(离线) |
| 类型检查 | `pnpm typecheck` 全仓绿(shared/web/server) |

## 2. 交付契约(与 design spec 对齐,接线方可直接消费)

- `retrieval.ts`:`tokenizeQuery`(中文 2-gram/英文小写词)、`retrieveMemories(entries, ctx)` → Top-N + `score{fts,importanceScaled,recency,objectBonus}` + `reasons[]`;评分 `0.45/0.35/0.20`(无世界时间 → `0.60/0.40`),半衰期 **1440** 世界分钟(评审修正),对象加成 +0.15,默认预算 6 条/600 字、单条 100 字截断;
- `importance.ts`:`computeMemoryImportance(input)` 基线 40 + 6 因子(重大事件 15(snapshot-logic 同集,只读导入)/极端状态 20/关系Δ≥10 时 15/涉事 10/负面 10 或正面 5/行动失败 10),夹取 [1,100];规则分对 Mock 与 AI 一致(与 AI 附注取 max 的接线侧逻辑);
- `summarize.ts`:`formatWorldMinute`(第 0 日 00:00 起算,演示起点 08:20=500,周六起始)、`worldDayNumber`、`clusterBySubject`、`buildMockSummary`(模板≤120 字,Top3×头 30 字)、`shouldReflect`(≥3×70 或同主题当日≥2/7 日≥4 且≥60)、`findDuplicateInsight`(同主题词元 Dice≥0.6)、`planArchiveEntries`(短期最新 40 条+importance≥85 保底,仅摘要覆盖后才归档;summary 7 世界日;insight 永不);
- `caption.ts`:`buildMemoryCaption`(单条注入行)、`buildMemoryContextSection`(§6.5 完整块,关系印象段可缺省);
- `mock-decision-bonus.ts`:`computeMemoryRelevanceBonus(candidate, recalled)` 0.06×命中(每条至多 1),上限 0.30,不命中=0(退化安全)。

## 3. 过程中的修正记录(供评审)

1. **world 分钟语义**:初版把 world 分钟解释为"自 08:20 起算",导致 500 分钟渲染为 00:00;修正为"自第 0 日 00:00 起算,演示起点 08:20=500"(`formatWorldMinute(500)="周六 08:20"`,跨日 500+1440→周日 08:20);测试同步修正;
2. **预算截断**:总字符预算按排序后**顺序累积**、超限即停并移除后续条目(保高分);"单条 100 字"为硬截断加省略号;
3. **`as const` 元组 includes**:`MAJOR_EVENT_TYPES.includes(string)` 类型报 TS2345,在 importance.ts 侧以 `readonly string[]` 类型化(未改 snapshot-logic);
4. **测试盲点修正**:检索时刻选在首世界日时,任何记忆 recency 均 ≥0.7,兜底理由断言不可达——测试改为"检索时刻后移、目标记忆拉近、旧记忆放缓";此为本实现按 spec 阈值(0.7)敏感区的说明:首 12 小时内几乎所有记忆都会命中"新近记忆"理由(设计如此,演示合理)。

## 4. 交付后待办(交由接线会话 / 主线)

1. **写入接线(串行区)**:W1 对话(双方各一条,扩展 `sendDialogueMessage`)、W2 事件(与 event-propagation 并行,仅 involved/sight)、importance 标注(AI 附注 `memoryImportance` 字段需按评审 §4.1 在 instructions 显式写完整 JSON 形状)+ `world_minute` 列;**mock-decision.ts / mock-dialogue.ts 接入本模块**;
2. **表与迁移(串行区)**:design spec §2.1/§2.4(增列 importance/subject/source_identifier/is_archived/world_minute + 索引 + 回填);**FTS 虚表 MVM 缓用**(评审修正,仅在单 NPC 记忆 >200 时启用且须 2-gram 入库);
3. **查询与路由(串行区)**:`GET /agents/:id/memories`;web NPC 面板记忆层(§8.1)与检查器记忆页(§8.2);
4. **复盘调度(串行区)**:世界日切换触发器 → `buildMockSummary`/`shouldReflect`/`findDuplicateInsight`/AI 压缩器 → `planArchiveEntries` 执行归档;
5. 以上均登记进注册表后按"串行区一次一会话"执行;本切片交付的纯函数为唯一实现,接线时**直接 import,勿复制逻辑**。

## 5. 验证证据(手动记录)

```
pnpm --filter @ai-town/server exec vitest run src/memory/  → 5 files, 50 passed
pnpm --filter @ai-town/server test                        → 19 files, 123 passed
pnpm typecheck                                            → shared/web/server 全部 Done
git status apps/server/src/memory/                        → 仅 ?? 新目录,无既有文件改动
```

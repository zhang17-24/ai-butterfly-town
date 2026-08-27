# 执行计划 · 记忆系统纯函数层(包 E2)

## 0. 勘察结论

- design spec 已提交(`32e8059`)并吸收 B 的评审修正(§13):FTS5 缓用→纯内存 2-gram;新近度用 `world_minute`;半衰期 1440;Mock/`memoryImportance` 提示词约束属**接线期**,本切片不涉及;
- 可复用:`snapshot-logic.ts` 的 `MAJOR_EVENT_TYPES`(只读 import,避免类型集双份维护);`event-preview.ts` 的 FNV-hash 风格不适用(无 hash 需求);包 E 纯函数风格(对象返回+中文 reason)保持一致;
- 世界分钟语义:start = D123 08:20(500 分钟,周六);`formatWorldMinute` 用于摘要"{日期}"占位;
- 新目录 `apps/server/src/memory/`,与任何在途切片无文件交集;不改任何既有文件。

## 1. 步骤(先文档后代码,测试先行)

1. 本文档 + 需求文档(本切片)✓/进行中;
2. `retrieval.ts`:常量(HALF_LIFE_WORLD_MINUTES=1440、权重、预算默认)+ `tokenizeQuery` + `retrieveMemories`;
3. `importance.ts`:`ImportanceInput` + `computeMemoryImportance`;
4. `summarize.ts`:`clusterBySubject` / `buildMockSummary` / `formatWorldMinute` / `shouldReflect` / `findDuplicateInsight` / `planArchiveEntries`;
5. `caption.ts`:`buildMemoryCaption`(单条注入行)+ `buildMemoryContextSection`(§6.5 完整块);
6. `mock-decision-bonus.ts`:`computeMemoryRelevanceBonus{bonus, matchCount, matchedIds}`;
7. 每模块配对单测(先写测试红→实现绿;断言覆盖 §9.1 U1–U12 的可单项);
8. 验证:`pnpm --filter @ai-town/server test` + `pnpm typecheck`;
9. 执行文档(留痕三篇)+ 注册表占位记录。

## 2. 文件清单

新增:

| 文件 | 关键导出 |
| --- | --- |
| `apps/server/src/memory/retrieval.ts` | `tokenizeQuery`, `retrieveMemories`, `MemoryEntryView`, `RecalledMemory`, `RecallContext`, 评分配置常量 |
| `apps/server/src/memory/importance.ts` | `computeMemoryImportance`, `ImportanceInput`, 因子常量 |
| `apps/server/src/memory/summarize.ts` | `clusterBySubject`, `buildMockSummary`, `formatWorldMinute`, `shouldReflect`, `findDuplicateInsight`, `planArchiveEntries` |
| `apps/server/src/memory/caption.ts` | `buildMemoryCaption`, `buildMemoryContextSection` |
| `apps/server/src/memory/mock-decision-bonus.ts` | `computeMemoryRelevanceBonus`, `MOCK_REFLECTION_BONUS` |
| `apps/server/src/memory/*.test.ts` ×5 | 覆盖 U1–U12 |

修改:无(既有文件零改动)。

## 3. 风险与规避

| 风险 | 规避 |
| --- | --- |
| 与接线期契约漂移 | 导出签名严格对齐 design spec §6.1/§7.1;接线时以本模块为唯一实现 |
| 中文 2-gram 边界(单字/标点/仅英文) | tokenize 规则含测试:空串、纯标点、中英混排、单字 query |
| 预算截断交互(条数+字数字共存) | 先按条数取 Top-N,再单条截取,最后总长度移除;三处各自单测 |
| mock 加成重复计分 | 每条记忆至多计 1(命中即 break);测试双命中断言 count=1 |

## 4. 完成判据

- server 测试全绿(新增 ≥30 用例,全部离线);`pnpm typecheck` 全仓绿;
- `git diff` 对既有文件零输出;
- 执行文档登记"新增文件清单 + 接线待办"(W1–W4 写入点、Prompt builder、面板接口等串行项)。

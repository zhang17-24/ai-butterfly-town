# 需求文档 · 记忆系统纯函数层(包 E2,claude E 会话,2026-08-28)

- **Agent**:claude E 会话(接包 E 之后的新切片)
- **负责切片**:记忆系统(D13/D14)**纯函数层先行**——`memory-system-design.md` §10.1 可立即并行区
- **代码基线**:HEAD `32e8059`(记忆系统设计 spec 已提交)
- **设计依据**:`docs/agents/memory-system-design.md`(已含 Claude B 评审修正:§2.3 FTS5 缓用、§2.1 `world_minute`、§6.2 半衰期 1440、§4.1 DeepSeek json_object、§13 范围收敛)= 本需求的事实来源

## 1. 范围(只做 §10.1 纯新增)

| 文件 | 内容 | 对应设计节 |
| --- | --- | --- |
| `apps/server/src/memory/retrieval.ts` | 中文 2-gram 词项化 + 纯内存相关度评分 + 理由 + 预算截断 | §6.1–§6.4 |
| `apps/server/src/memory/importance.ts` | `computeMemoryImportance`(基线 40 + 6 因子,夹取 1–100) | §4.2 |
| `apps/server/src/memory/summarize.ts` | 分簇 / Mock 摘要模板 / insight 触发与去重 / 归档裁剪决策 | §5.2–§5.4、§2.1 裁剪 |
| `apps/server/src/memory/caption.ts` | 上下文注入模板格式化(§6.5)+ 单条记忆说明行 | §6.5 |
| `apps/server/src/memory/mock-decision-bonus.ts` | Mock 决策记忆加成(0.06×匹配,上限 0.30) | §7.1 |

## 2. 关键规则(评审修正版,与 design spec 严格一致)

1. **新近度**:一律用**世界分钟**(`createdAtMinute`/`worldTimeMinute`),半衰期 `HALF_LIFE_WORLD_MINUTES = 1440`(1 世界日);不用墙钟;
2. **检索**:MVP **纯内存匹配**,不建 FTS 虚表;中文按连续汉字 2-gram 切分,英文/数字按 `[0-9a-zA-Z_]+`,空词项 ftsScore=0;
3. **评分**:`0.45·fts + 0.35·importance + 0.20·recency + objectBonus(≤0.15)`;无世界时间时 `0.60·fts + 0.40·importance`;
4. **理由**:每条召回 ≥1 条可解释理由(命中词/高重要≥70/新近≥0.7/对象加成/长期认识,兜底"默认相关度排序");
5. **预算**:默认 6 条 / 600 字,单条 ≤100 字截断,超预算尾部移除;
6. **importance**:基线 40;MAJOR 事件(snapshot-logic `MAJOR_EVENT_TYPES` **只读 import**)+15;极端状态 +20;关系变动(≥10 绝对值)+15;涉事 involved +10;负面 +10 / 正面 +5;行动失败受挫 +10;夹取 [1,100];
7. **Mock 加成**:每条记忆与候选文本(id/label/destinationId/reason)2-gram 命中计 1,每条至多 1,`bonus = 0.06 × count`,上限 0.30;
8. **摘要(Mock)**:按 subject 分簇 → 模板 `{日期}:{主题}相关经历 {k} 条` + 重要性降序前 3 条内容头 30 字,≤120 字,确定性;
9. **insight 触发**:当日 ≥3 条 importance≥70,或同 subject 当日 ≥2 条 / 7 日累计 ≥4 条且 ≥60;同主题(词元重叠 ≥60%)更新而非新建;上限 20 超限合并最旧;
10. **裁剪决策**(纯逻辑):短期(对话/事件/行动)保留最新 40 条 + importance≥85 保底;summary 保留近 7 世界日;仅"已进入当日 summary 覆盖(subject 匹配)"的短期条目才可归档;insight 永不归档(只超限合并)。

## 3. 硬边界(不做)

- 不写库、不改表/迁移(`db/*`)、不动 `packages/shared/src/index.ts`、`app.ts`、`App.tsx`、根 `package.json`(串行区);
- 不改既有 `mock-decision.ts` / `mock-dialogue.ts` / `dialogue/*`(接线属串行,本切片只提供纯函数供其消费);
- 不做"AI 压缩提示词"(接线时做)、不做 FTS5 虚表(评审后 MVP 缓用)、不做 `recalledCount` 写入(打磨级);
- 不做浏览器回归。

## 4. 验收

1. `pnpm --filter @ai-town/server test` 全绿(新增用例 ≥30);`pnpm typecheck` 全仓绿;
2. 全部离线、无 AI/网络依赖;固定输入恒等输出;
3. 只读 import:仅 `snapshot-logic` 的 `MAJOR_EVENT_TYPES` 与 shared 类型(如需要);对既有文件零修改;
4. 每个导出函数皆可被后续接线直接消费(签名与 design spec §6.1/§7.1 对齐)。

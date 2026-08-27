# M5 事件注入与因果链 · 落地级设计规格(Claude A 会话)

> 状态:设计分析稿(零代码改动,供 M4-2 提交后直接编码)
> 依赖:M4-2 切片提交(注册表规则);对模拟管线的增量改动基于其提交后形态

## 0. 事实核对(2026-08-28 读库确认)

| 事项 | 事实 |
| --- | --- |
| knowledge 表 | 已有:`id/worldId/agentId/factJson/sourceEventId/confidence/createdAt`(schema.ts:105)— **无需迁移即可承载传播** |
| events 表 | 已有 `version/branchId/cause_ids_json/payload_json/schema_version` — causeIds 链可直接写 |
| 现有事件类型 | `player.moved`、`dialogue.started`、`dialogue.ended`(无 message 事件,属 M4-2 缺口) |
| 候选生成 | `getActionCandidates(npc, gameMinute, worldVersion): MockAction[]` 纯函数,无事件/知识输入(mock-decision.ts:35) |
| 决策上下文 | `SimulationDecisionService.decide` context 仅身份+状态,无可知事件 |
| 用户操作面 | WorldPage 已有 recentEvents 流展示;无事件注入工具栏;无 causal 页/路由 |

## 1. 总体数据流(遵循技术方案 §6.3 三层)

```
玩家:自由文本/模板 → PREVIEW(纯计算,不写库)
  WORLD/Mock 把文本 → EventFact{summary, locationId?, gameMinute?, kind, public}
  返回 { previewId, fact, 影响 NPC 数, 冲突提示? }
玩家确认 → COMMIT(世界命令,幂等键 + expectedVersion)
  事务: 写 world_event(type=factory.event, actor=player)
       播 Knowledge:每 NPC 按可见性范围 → knowledge 行(factJson+sourceEventId+confidence)
  WebSocket 广播 world.status
后续 Tick:受影响 NPC 决策上下文含个人 Knowledge 候选加权;AI 上下文含"可知事件摘要"
  由执行结果生成 causeIds(子事件 causeIds 链上被引用事件)
UI:causal 页读取事件增量,按 causeIds 画两级链路
```

## 2. Schema 草案(字段级,加入 packages/shared/src/index.ts,等 M4-2 提交后)

```ts
EventFactKindSchema = z.enum(["weather","accident","public_notice","gathering","rumor"])
EventVisibilitySchema = z.enum(["public","heard","witnessed"])   // 公共/可听/可见(详见 §3)
EventFactSchema = {
  statement: string(客观事实一句话,≤120),
  kind: EventFactKindSchema,
  locationId: string|null,      // 事件地点,默认镇中心
  minute: number|null,          // 发生小镇时间,默认当前分钟
  public: boolean,              // 是否公开广播(市集公告/广播)
  visibility: { witnessedIds: string[], heardIds: string[], publicAll: boolean }  // 服务端计算,给确认页预览
}
EventPreviewResultSchema = { previewId: string, fact: EventFactSchema, affectedNpcCount: number }
EventCommitInputSchema = { previewId, expectedVersion, idempotencyKey, statementOverride? }
EventCommitResultSchema = { event: TownEvent, world, affectedNpcs: [{agentId, knowledgeId}], summary }
```

**causeIds 规则**:commit 生成的根事件 `causeIds=[]`;后续 NPC 反应(计划改变/行动)事件 `causeIds=[rootId, ...]`;缺父引用不允许提交(验收 6.7)。

## 3. 传播模型 MVP(确定性、固定种子可重现)

| 通道 | 规则(MVP) | 依据 |
| --- | --- | --- |
| public | `fact.public=true` → 全部 NPC 获得 knowledge(confidence 0.9) | 公共信息层 |
| witnessed | NPC 位置与 `fact.locationId` 距离 ≤ 200px(1 个网格单位) | 可见层 |
| heard | 与目睹者同地点(距离 ≤ 200px)或已有关系 ≥ 60 | 听声层,顺着关系网络 |
| 置信度 | public=0.9, witnessed=0.75, heard=0.5 | 主观解释差异化 |

**NPC 差异化的 Mock 评分注入**(不改 getActionCandidates 签名,新增独立因子函数):

```ts
eventInfluence(npc, facts, gameMinute): Map<actionId, number>   // -8..+8
// 如:暴雨(weather+crisis 类)+ 林夏(setup)/唐记者(核实)→ 相关候选加分;
// NPC 无 knowledge 时恒 0 → “不知情不引用”由上下文缺失天然保证
```

AI 路径:决策上下文 `knownEvents` 只含该 NPC knowledge 的 sourceEvent 摘要(≤5 条)+ 明显提示"你的回答只能依据这些"。

## 4. 命令语义(API)

| 接口 | 行为 | 失败 | 测试点 |
| --- | --- | --- | --- |
| `POST /events/preview` | 纯函数计算,幂等(同文本同版本返回同 previewId),**不写库** | 文本长度/敏感内容 | 取消前后状态不变 |
| `POST /events/commit` | 事务:`expectedVersion` 校验→事件+knowledge+版本递增+幂等键;同键重放返回原结果 | NOT_FOUND/BUSY/VERSION_CONFLICT(与对话一致) | 重复提交只落一次 |
| `GET /timeline` | `afterVersion` 分页事件(现有 `listEventsAfter` 复用) | — | — |
| `GET /causal` | 最近 N 事件的因果图:节点{event 简表},边{from,to,relation}(`causeIds` 反查) | — | 两级链路存在 |

## 5. 前端规格

- **WorldPage 工具栏**(地图右上或事件流头部):+ 按钮 → 面板:3 个模板(暴雨预警/河岸市集公告/小镇传闻)+ 自由文本框 → “预览” → 摘要 + 影响人数与“将影响哪些 NPC”提示 → 确认/取消。
- **CausalPage**(新路由 `/world/:worldId/causal`,第 6 条路由):
  - 上:类型/NPC 过滤器;
  - 中:事件列表(时间倒序,含 type 徽章+来源);
  - 下:选中事件的 2 级链路(root → 反应事件 → 行动),画成简单纵列,关系写边标签(知识/计划改变/行动)。
  - 无数据时引导到“注入事件”。
- 样式沿用 styles.css 的 paper 风格;Phaser 不承担因果图(M5 不与地图耦合)。

## 6. 测试清单(M5)

| 层 | 用例 |
| --- | --- |
| 单元(领域层) | 三种可见性通道组合正确;无 knowledge 时影响为 0;同 seed 同输入两次结果相同(方差字段用稳定噪声) |
| 集成(路由) | preview 不写库(事务数/事件数断言);commit 幂等;错误版本冲突;knowledge 行数与可见性一致;causeIds 反向可建边 |
| 集成(模拟) | 注入暴雨(08:40 模板)后连续 N tick,≥2 名 NPC 的行动/计划变化(与未注入基线世界比较) |
| 回归 | M4-1 移动 + M4-2 对话主流程不回归(`pnpm verify` 全绿) |

## 7. 对模拟管线的增量改动(等 M4-2 提交后,基于最终形态)

- `simulation-service`(tick)或 `simulation-decider`:上下文加 `knownEvents`;
- Mock `eventInfluence` 挂到 `getActionCandidates` 调用之后(合成分数)或作为独立层在 `decide` 内叠加——**提交后以 M4-2 的最终结构为准,先读后改**;
- 注意:这几个文件当前属于 M4-2 归属,本规格不提前动手。

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| M4-2 提交延迟,模拟管线形态未定 | 本规格的领域层(§1–§3)与模拟管线解耦,先实现事件/知识/命令;知识→决策接线最后做 |
| 暴雨影响面过大导致候选总是暴涨 | eventInfluence 上限 ±8,且按人格特质打折(谨慎型负面事件→规避行为) |
| 因果图复杂度失控 | MVP 固定“root→直接子事件”两级,高级布局明确 Reserved |

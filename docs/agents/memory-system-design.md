# 记忆系统设计规格 · D13/D14(2026-08-28 与用户逐项确认后成稿)

> 本文是"可见的记忆闭环"设计规格:覆盖三层记忆、召回、反思、Mock 参与、UI 与测试的**每一个细节**。
> 决策来源:living-requirement-map v1.5 D13/D14/D17/D24/D39/D41/D49/D51/D54/D68/D69/D83 + 2026-08-28 用户逐项确认记录。
> 实施分工:本文将明确"可立即并行(纯新增)"与"串行等主线(表/仓库/路由)"两部分。

## 0. 一句话目标

**让居民真的记得过去,并且可证明、可解释、无 Key 也成立。** NPC 在对话或决策中引用旧经历("上次市集取消…"),面板能查看记忆列表与每条被召回的理由,AI 与 Mock 行为一致,测试能举证记忆改变了上下文。

成功验收(演示时逐条可展示):
1. NPC 对话中引用具体旧经历(日期+对象+内容);
2. NPC 面板"记忆"层展示时间线列表与召回理由;
3. AI 与 Mock 两种模式下行为一致(固定种子下相同输入产生等价上下文);
4. 测试断言:召回函数输入固定 → 输出确定、理由可解释、记忆真的进入 Prompt。

---

## 1. 概念模型:四存储分工(已确认)

| 存储 | 现状 | 语义 | 权威来源 |
| --- | --- | --- | --- |
| `knowledge`(事实) | 已有表,事件传播写入 | 客观事实:谁于何时知晓什么,带来源事件与置信度 | M5 事件传播(不变) |
| `memories`(经历) | 已有表,仅对话写入 1 处 | 个人亲身经历的主观叙事 | **本设计扩展** |
| `summaries/insights` | 不存在(用 memories.kind 承载) | 长期压缩:多日摘要 / 稳定认识 | 每日复盘 |
| `relationships`(印象) | 已有表(state_json) | 对某人的熟识/好感/信任/尊重/摘要 | D41(不变,只读合入) |

对应 D24 三层:**客观事实(knowledge)→ 掌握信息(knowledge 召回 + 关系印象)→ 主观理解(memories 主观叙事 + insight)**。

分工铁律:
- knowledge 只写事实(事件传播),不写情绪/评价;memories 只写主观经历,不替代事实;
- 同一事件可以同时产生 knowledge 条目与 memories 条目,正文与字段不同;
- 决策/对话上下文 = knowledge 召回(事实) + memories 召回(经历) + relationships 摘要(关系) 三段合并。

---

## 2. 数据模型(实施属串行区,排期见 §10)

### 2.1 `memories` 增列(ALTER TABLE,SQLite 支持 ADD COLUMN)

| 列 | 类型 | 规则 |
| --- | --- | --- |
| `id` | TEXT PK | 已有,保留 |
| `world_id` / `agent_id` | TEXT | 已有,保留 |
| `kind` | TEXT(枚举) | 已有列;**扩展枚举值**:`dialogue` \| `event` \| `action` \| `summary` \| `insight`(旧数据 kind="dialogue" 兼容) |
| `content` | TEXT | 已有:经历正文(主观第一人称或第三人称叙事,≤240 字,与对话 memory 字段同构) |
| `metadata_json` | TEXT | 已有,扩展键控(见 §2.2) |
| `created_at` | TEXT | 已有(墙钟,仅作审计) |
| `world_minute` | INTEGER | **新增** | 记忆发生时的世界分钟(基准=D123 起 08:20;新近度一律用它,保证固定种子可复现,不依赖墙钟 `created_at`) |
| `importance` | INTEGER 0-100 | **新增**,写时标注,见 §4.2 |
| `subject` | TEXT | **新增**:记忆对象。人物 = guardTrainedId;地点 = locationId;其余 = 主题词(如 "market"/"rain")。用于对象匹配加成与分簇 |
| `source_identifier` | TEXT | **新增** 幂等键:`{kind}:{worldId}:{ownerId}:{来源事件id或会话id或日期}`。相同键跳过写入 |
| `is_archived` | INTEGER 0/1 | **新增** 裁剪标记:被摘要收编但保留叙事时置 1,检索默认排除;实现可简化为直接删除+摘要兜底 |

### 2.2 `metadata_json` 键控(写入时约束)

```json
{
  "sourceEventId": "ev_xxx" | null,        // event 记忆专用
  "sessionId": "sess_xxx" | null,          // dialogue 记忆专用
  "counterpartNpcId": "npc_xxx" | null,    // 对话/事件对手方
  "locationId": "riverside" | null,        // 发生地点
  "tone": "positive" | "negative" | "neutral" | null,  // 情绪标注(Mock 规则产出,AI 附注可选)
  "aiAnnotated": true | false,             // importance 是否由 AI 附注(检查器展示)
  "recalledCount": 3,                      // 统计:被召回次数(检查器"为什么它老被打扰")
  "sourceSnapshotVersion": 42              // 写入时世界版本(恢复一致性参考)
}
```

### 2.3 FTS5 镜像表（MVP 缓用，明确取舍）

> **评审修正**：FTS5 的 `unicode61` 对**中文整段**按一个 token 切分（无空格 → 单 token），若只把 `content` 原样入库，则「2-gram 化查询词」几乎匹配不到（整段=一个词，查单字 2gram 不命）。同时本设计 §6.1 已把召回做成「先按 agent 载入 `MemoryEntryView[]` 再做纯内存评分」——FTS 反而与内存评分重复。

**因此 MVP 采取：纯内存 2-gram 匹配，不建 FTS 镜像表。** 只有当单 NPC 记忆量明显增大（暂估 >200 条）需要先缩候选集时，才启用 FTS，且**必须对入库内容做 2-gram 分词再存入**（`content_grams`，空格分隔），查询词同样 2-gram 化后 MATCH。以下仅作未来草案：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  memory_id UNINDEXED,
  content_grams,          -- 2-gram 化后的文本,空格分隔
  subject_grams,
  agent_id UNINDEXED
);
```

- 启用时才同步 upsert；MVP 不做镜像与回填，保留 §2.4 的列迁移即可。

### 2.4 索引与迁移步骤

```sql
-- ① 增列
ALTER TABLE memories ADD COLUMN importance INTEGER NOT NULL DEFAULT 40;
ALTER TABLE memories ADD COLUMN subject TEXT;
ALTER TABLE memories ADD COLUMN source_identifier TEXT;
ALTER TABLE memories ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
UPDATE memories SET source_identifier = kind || ':'
  || world_id || ':' || agent_id || ':' || id WHERE source_identifier IS NULL;
-- ② 虚表(见 §2.3)并回填
-- ③ 回填 importance:既有 dialogue 记忆默认 40(规则中位值)
-- ④ 索引
CREATE INDEX IF NOT EXISTS idx_memories_agent_imp ON memories(world_id, agent_id, importance DESC);
```

迁移一次性执行,幂等(每个 ADD COLUMN 用 `PRAGMA table_info` 检查或有迁移框架时以迁移记录保证)。

---

## 3. 写入管线(实施:对话写入点属串行区扩展;纯规则部分可并行)

### 3.1 四个写入点

| # | 写入点 | kind | 触发 | 内容 | 备注 |
| --- | --- | --- | --- | --- | --- |
| W1 | 对话结束/消息交换 | `dialogue` | 每次玩家对话消息(现有 sendDialogueMessage 扩展) | 双方各写**自己的**主观版本:NPC 侧 = 回复摘要+对玩家的印象,玩家侧 = 本次对话摘要 | 现有写入保留,扩展 importance/subject/source_identifier;AI 输出的 memory 字段直接复用 |
| W2 | 事件亲身参与 | `event` | 事件传播时该 NPC `via=involved` 或 `via=sight`(同地点目击) | 一条主观经历:"我经历了 X,在 Y 地点" | 与 knowledge 写入并行但独立;只见证不参与的 NPC(hearing/unknown)只写 knowledge,不写 memories |
| W3 | 行动完成 | `action` | 核心动作执行器结束(Mock 决策或 AI 决策后、状态已原子提交) | 小结:"我完成了/尝试了 {action}(结果 {ok/failed/trajectory}),{可选一句复盘}" | 忽略低价值动作(空闲/idle 走神类不写) |
| W4 | 每日复盘 | `summary` / `insight` | 世界日切换(见 §5) | 当日压缩摘要;触发 insight 时一条稳定认识 | 见 §5 |

### 3.2 幂等规则

`source_identifier` 唯一约束(应用层先查后写,同事务内):
- W1:`dialogue:{world}:{npc}:{sessionId}:{seq}`;
- W2:`event:{world}:{agent}:{sourceEventId}`;
- W3:`action:{world}:{agent}:{actionId}:{attemptSeq}`(同动作重试不重复);
- W4:`summary:{world}:{agent}:{YYYY-MM-DD}` / `insight:{world}:{agent}:{主题}`(insight 以主题为幂等键:当天已有同主题 insight 时**不新建**,改为在该条上追加/更新内容并把 importance 取 max,保证同主题一日至多 1 条)。

重复写入直接跳过并计入 trace(检查器可断言"无重复记忆")。

### 3.3 写入事务边界

- W2/W3 与主状态更新**同事务**(写入失败则事件/行动回滚)——符合"任何已显示成功的动作都已持久化"。
- W1 与对话消息同事务,保持现状。
- W4 独立事务,失败重跑幂等(靠 source_identifier)。

---

## 4. importance 标注(写时标注,已确认)

### 4.1 总规则

```
最终 importance = max(模型附注分, 规则计算分), 夹取到 [1, 100]
```
- **AI 附注**:决策/对话输出 Schema 增加可选字段 `memoryImportance?: number`(与现有 `memory?: string` 同构,≥60 才写入;不写则只用规则分);AI 附注标记 `aiAnnotated: true`;
- **注意(接入 DeepSeek/chat,json_object 模式)**:Provider 现为 chat 风格 `response_format={type:"json_object"}`(DeepSeek 不支持 json_schema 严格模式)。故新增 `memoryImportance` 时,两边 decider 的 instructions 必须**显式写出完整 JSON 形状**(含 "json" 字样),如 `{"reply":"…","intent":"…","memory":"…","memoryImportance":60}`,否则 json_object 模式可能按任意 JSON 返回导致缺字段/校验失败——与已有 `completeDialogue` 提示词改法一致。
- **规则兜底(Mock 与 AI 均生效)**:纯函数 `computeMemoryImportance(spec)`,见 §4.2;
- 演示强调:同一输入(种子固定)规则分确定,故 AI 附注字缺失时 Mock/AI 回退到同一规则分 → **两端一致**。

### 4.2 规则分(RuleScore,0-100,累加后夹取)

| 因子 | 加分 | 条件 |
| --- | --- | --- |
| 事件类型权重 | +15 | kind=event 且类型 ∈ MAJOR(与 snapshot-logic MAJOR_EVENT_TYPES 同集:`factory_fire/flood/emergency/accident/power_outage`) |
| 极端状态出现 | +20 | 内容涉及 npc 状态 < 20 或 > 85(饥饿/精力/健康/压力/心情任一) |
| 关系变动 | +15 | metadata.counterpartNpcId 存在且同事务关系 update(信任/好感变化绝对值 ≥ 10) |
| 涉事(亲身) | +10 | kind=event 且 via=involved(非仅目击) |
| 情绪标注 | +10 | metadata.tone="negative"(负面更难忘)或 +5 tone="positive" |
| 行动结果异常 | +10 | kind=action 且 result=failed/trajectory(失败与受挫) |
| 基线 | +40 | 任何写入的对话/行动/事件记忆(确保普通经历也有中位分) |

例:市集取消事件(亲身在场、负面情绪)= 40(基线)+10(涉事)+10(negative)= 60;普通打卡对话 = 40。

### 4.3 回填与默认

- 既有对话记忆:importance 默认 40(迁移 DEFAULT);
- 新写入无任何因子命中:40。

---

## 5. 摘要/反思 —— 按日复盘(已确认:AI 压缩 + Mock 模板兜底)

### 5.1 触发

- 世界日切换时(游戏时间跨过 24:00 边界,或跳时前/后),对世界内每个"有记新记忆的 NPC"执行一次复盘;
- 跳时场景:跳时计划内若有复盘点(日切),结束后补复盘;紧急停跳后仍执行(复盘本身不依赖模拟完成度)。

### 5.2 Summary(记忆→摘要)

1. **分簇**:当日(上次复盘后)W1/W2/W3 记忆按 subject 分簇(同人物/同地点/同主题词);
2. **压缩**:每簇调用压缩器:
   - **AI**(真实):prompt =「以下是 NPC 于 {日期} 的 {N} 条经历,压缩为一段 ≤120 字摘要,保留事实与情绪」,输出为一条 `summary` 记忆;
   - **Mock**:模板拼接 `{日期}:{主题}相关经历 {k} 条 —— {逐条|内容头 30 字}`,按重要性降序取前 3 条拼;
3. **收编**:当日的短期记忆(被压缩覆盖的)置 `is_archived=1`(检索默认排除;无 archiving 实现时直接删除,前提摘要已写出——见 §5.3 顺序);
4. summary 上限:同一主题同日只 1 条(source_identifier 幂等)。

### 5.3 覆盖检查(裁剪前置条件,顺序不可倒)

```
步骤:复盘(write summary) → 检查每条短期记忆已进入某 summary(按 subject匹配)
      → 全部覆盖后,才允许其被裁剪/归档
```

### 5.4 Insight(反思,稳定认识)

- **触发规则**(纯函数 `shouldReflect(dayMemories, existingInsights)`):
  - 当日出现 ≥3 条 importance≥70 的记忆;或
  - 同一 subject 当日 ≥2 条(或累计 7 日内 ≥4 条)importance≥60;
- **生成**:
  - AI:prompt =「基于这些经历,我们应形成一句对 {主题/人物} 的长期认识,(≤80 字,第一人称,不再重复既有 insight)」;
  - Mock:模板 `我明白了:{聚类主题}往往伴随 {高频事件词};下次{建议动作}。`(由统计:高频 type/高频 tone);
- **上限 20 条/NPC**:超限时,新 insight 替换"最旧且主题冲突"的旧 insight(合并:新内容吸收旧内容,旧条删除,新条 source_identifier 继承旧 id 前缀);同主题去重:新 insight 主题 = 既有 insight 主题且内容相似度(词元重叠 ≥60%)→ 只更新原有条(重要性= max)。

### 5.5 Insight 的生命周期

- insight 不被归档、被召回;**裁剪只发生在"超限合并"时**;
- insight 作为高相关记忆参与召回,但召回理由标注 kind=insight("长期认识:…")。

---

## 6. 召回管线(纯函数,可立即并行开发)

### 6.1 主函数签名(先给纯函数,接线在串行区)

```ts
// apps/server/src/memory/retrieval.ts (新文件,纯 TS;SQL 由调用方注入或走 repository)
export interface RecallContext {
  agentId: string;
  query: string;                    // 当前任务/用户消息的检索文本
  worldTimeMinute: number | null;   // 当前世界分钟(新近度基准;null=只用重要性+相关度)
  relatedAgentId?: string;          // 上下文涉及的对象人物(对象匹配加成)
  locationId?: string;              // 上下文涉及的地点
  budget?: { maxEntries: number; maxChars: number };  // 注入预算,默认 6 条/600 字
}
export interface RecalledMemory {
  id: string;
  kind: "dialogue" | "event" | "action" | "summary" | "insight";
  content: string;
  importance: number;
  subject: string | null;
  createdAt: number;                 // 世界分钟或毫秒归一
  score: { total: number; fts: number; importanceScaled: number; recency: number; objectBonus: number };
  reasons: string[];                 // 召回理由(每一条可解释,进面板与 Prompt 注记)
}
export function retrieveMemories(entries: MemoryEntryView[], ctx: RecallContext): RecalledMemory[]
```

- `MemoryEntryView` 为最小视图类型(由 repository 映射,纯函数不感知表结构):
  ```ts
  export interface MemoryEntryView {
    id: string;
    kind: MemoryKind;          // "dialogue"|"event"|"action"|"summary"|"insight"
    content: string;
    importance: number;
    subject: string | null;
    createdAtMinute: number;   // 世界分钟
    archived: boolean;
    sourceIdentifier?: string | null;
  }
  ```
- `memory/retrieval.ts` 是无 IO 纯函数:输入"该 NPC 当前记忆视图"(repository 提供)+ 上下文,输出 Top-N;
- `memory/fts-query.ts`:把中文 query 词项化(按 tokenize 规则:`unicode61` 下空格/标点切分;中文整句按 2-gram 化查询词,简单实现见 §6.3)。

### 6.2 评分公式(权重恒定,写死常量导出可调)

```
ftsScore = 命中数量 / 词项数(0-1)
importanceScaled = importance / 100
recency = exp(-max(0,(worldNowMinute - createdAtMinute)) / HALF_LIFE_WORLD_MINUTES * ln2)   // HALF_LIFE_WORLD_MINUTES = 1440(1 世界日 = 24*60 游戏分钟),一律用世界分钟,种子可复现
objectBonus = +0.15 (relatedAgentId 或 locationId 与 subject 匹配)

score = 0.45·ftsScore + 0.35·importanceScaled + 0.20·recency + objectBonus
```

- 无 worldTimeMinute 时:score = 0.60·ftsScore + 0.40·importanceScaled(新近度被压缩掉,权重归一);
- objectBonus 是附加项,不加权,上限 0.15,说明"同时与当前对象相关";
- 排序后取前 `maxEntries`(默认 6),并执行预算截断:每条 ≤100 字,总 ≤ maxChars(600),超预算的删尾部条目(保留高分)。

### 6.3 词项化(中英混合,确定性)

```
1. 中文:按连续中文字符 2-gram 切分("市集取消" → 市集,集取,取消),去重;
2. 英文/数字:按 [0-9a-zA-Z_]+ 切分,小写;
3. 命中数:`tokenizeQuery(query)` 每词项在 `entry.content` 中出现即 +1,ftsScore = 命中/词项数(内存匹配,纯函数)。
```
实现细节与单测:`tokenizeQuery("暴雨天市集" )` → ["暴雨","雨天","天市","市集"];空查询(无可分词)时 ftsScore=0。
> 若未来启用 FTS5(§2.3),则入库内容也须按同样规则 2-gram 化后写入 `content_grams`;查询词 2-gram 化后做 MATCH,不能对原文匹配。

### 6.4 召回理由(可解释)

每条召回产生 reasons 数组,例如:
- `"命中词:市集/取消"`(ftsScore>0);
- `"高重要经历(78/100)"`(importance≥70);
- `"1 天内存下的新近记忆"`(recency≥0.7);
- `"与当前对象(林夏)直接相关"`(objectBonus 命中);
- `"长期认识"`(kind=insight);
对返回的每条记忆,至少 1 条理由(兜底:"默认相关度排序")。

### 6.5 上下文注入模板(供决策/对话 Prompt builder 消费,接线串行)

```
[相关经历]
- {时间(YYYY-MM-DD 08:40)} | 类型:{kind} | 重要度:{importance}
  {subject && `对象:{subject}`}
  {content}
  ({reasons 拼接})
[与 {relatedAgent} 的关系印象]
{relationships.state_json.summary || "暂无认识"}
[已知事实]
{knowledge 召回(现有渠道)}
```
- 决策上下文与对话上下文共用,但**决策只取 ≤4 条**、对话取 ≤6 条(§9.3 最小上下文,独立 token 预算);
- 上下文保留"重要度+理由"不展示给用户;Prompt 内以紧凑格式给出,便于 AI "想起来"。

---

## 7. Mock 参与(同一检索,已确认)

### 7.1 Mock 决策评分加成

- 在现有 mock 决策效用评分(需求/时段/性格/事件/种子)基础上新增因子:
  ```
  relevanceBonus = 0.06 × Σ(候选动作对象/地点/动作特性 与 召回记忆字面匹配数)   // 上限 +0.30
  ```
- 匹配规则(确定性):候选 actionId/label/destinationId/参数中出现召回记忆 content 的 2-gram → 记 1 次匹配;每条记忆至多计 1;
- 记忆只加不分减;**记忆不参与**,评分与完全不接记忆一致(退化安全);
- 输出 trace:把 `recalledMemories` id 列表与加成值记录进决策 trace(检查器可断言)。

### 7.2 Mock 对话回复

- 现有 Mock 对话模板管线插入一步:意图识别后,若涉及场所/人物/事件(mention 命中),注入检索 Top-3 记忆作为模板上下文(有则优先使用含日期/对象的模板句式:如“我记得{moment}时{mention}这事…”);
- 未知事实保护:记忆不能当作“当前事实”回答——引用记忆时必须使用过去式句架(避免 Mock/AI 说过期事实为现状)。

### 7.3 两端一致性原则

- AI 与 Mock 使用**同一 retrieveMemories 实现**(规则层);
- 差异只允许在"内容生成器"上(AI 压缩 vs Mock 模板、AI 附注 vs 规则分),检索数字与召回集合必须一致;
- 固定种子集成测试:同一世界与输入下,AI-off(Mock)两次召回集合相同。

---

## 8. UI(接线串行,设计定稿)

### 8.1 NPC 侧边面板 —— 记忆层(D54)

| 区 | 内容 | 来源 |
| --- | --- | --- |
| 记忆列表 | 按时间倒序(默认 20 条),每条:kind 徽标 | 对话/事件/行动/摘要/认识;时间、对象、内容、importance 星标(≥70 高亮) |
| 召回理由 | 列表右上"为什么这几条被提到?"——展开后显示当前上下文(最近召回)的 reasons 数组 | 连线到召回日志(检查器) |
| 关系印象区 | 对阵目标人物的摘要句(读 relationships) | 与"关系"层共用 |
| 认识区 | insight 列表(≤20) | kind=insight |

- 交互:点击某条记忆 → 详情(全文 + metadata_json + sourceIdentifier + aiAnnotated 标记 + 被召回次数 recalledCount);
- 数据接口(路由=A 区):`GET /agents/:id/memories?kind=&limit=` 与现有 `/agents/:id/...` 面板统一(面板现接 `worldState` 之外按需拉取)。

### 8.2 开发者检查器(D51)

- 在既有"决策"检查器旁新增"记忆"页:召回时刻的 query、词项化结果、score 四项分解(fts/importance/recency/objectBonus)、reasons 原文、注入 Prompt 的完整段落;
- 调试助手:预演器——输入一个 NPC+query,现场跑 retrieveMemories 看排序与理由(纯前端调用端点,Mock 可完成,接线同 §8.1)。

### 8.3 无 Key 演示一致性

- 所有面板与召回理由在 Mock 模式下完整可看(不依赖 AI);
- 摘要 Mock 模板产出照常显示,UI 标注来源(Mock 徽标)。

---

## 9. 测试矩阵(实施时展开为用例)

### 9.1 单元(纯函数,离线,可立即写)

| # | 目标 | 断言示例 |
| --- | --- | --- |
| U1 | 评分公式 | 固定输入→固定输出;权重调整后排序单调合理 |
| U2 | 新近度衰减 | 同日新记忆分数高于一周前;半衰期边界(2880 分钟 = 0.5) |
| U3 | 词项化 | 中英混排与 2-gram 边界;空 query 不炸 |
| U4 | 预算截断 | maxEntries=6、maxChars=600 生效;截断保高分 |
| U5 | 召回理由 | 每条返回 ≥1 理由;四种理由各自触发条件 |
| U6 | objectBonus | 比对对象/地点匹配 +0.15;不匹配 0 |
| U7 | importance 规则 | 规则表每因子单测;夹取 [1,100];负面>正面 |
| U8 | insight 触发 | ≥3 条≥70 或同主题累计规则;幂等(同主题一日 1 条) |
| U9 | 摘要模板(Mock) | 分簇→拼接确定性;≤120 字;幂等 source_identifier |
| U10 | Mock 加成 | 匹配计数与 0.06 权重;不匹配=0;trace 记录 |
| U11 | 裁剪边界 | 40/7/20 边界;覆盖检查阻止未摘要条目被删;高 importance 保底 |
| U12 | 幂等去重 | 同 source_identifier 二次写入跳过 |

### 9.2 集成(离线,固定种子)

| # | 场景 |
| --- | --- |
| I1 | 对话→双方记忆写入(内容/importance/subject 断言)→召回→注入 Prompt 段出现该记忆 |
| I2 | 事件(M5 传播)同步写 W2(仅 involved/sight)→knowledge 与 memories 内容差异断言 |
| I3 | 行动完成 W3;失败动作写记忆且 importance 高于成功动作 |
| I4 | 每日复盘:summary 生成→短期收编→裁剪通过;insight 触发→上限合并 |
| I5 | AI-off 双跑:同一世界、同一输入,两次召回集合相同(Mock 确定性) |
| I6 | 恢复:重启后记忆/摘要/insight 不丢失;恢复时按版本重放不重复写(source_identifier) |

### 9.3 演示回归(人工,或 E2E 骨架)

| # | 步骤 |
| --- | --- |
| P1 | 对话(当日)→ 面板记忆列表出现 1 条,带召回理由 |
| P2 | 投入市集事件 → NPC 经历写记忆 → 次日对话 AI 引用("上次市集…") |
| P3 | 面板记忆层打开"为什么提到" → 四类理由可见(Bundle:命中词/重要度/新近/对象) |
| P4 | Mock 开关 → 无 Key 重放 P1-P2,引用内容等价 |
| P5 | 开发者检查器:召回时刻 query/score 分解/注入段落完整 |

---

## 10. 实施分工与排期(关键)

### 10.1 串/并行边界

| 区 | 文件 | 归属 |
| --- | --- | --- |
| 可立即并行(纯新增) | `apps/server/src/memory/retrieval.ts`、`memory/importance.ts`、`memory/summarize.ts`、`memory/caption.ts`(+各自 test)、`memory/mock-decision-bonus.ts` | **由接顺手会话(如 E 会话)先行** |
| 串行(A 主线或其后) | `packages/shared/src/index.ts`(Schema:memoryImportance/memories 契约)、`apps/server/src/db/schema.ts`、`db/database.ts`(迁移)、`db/repository.ts`(memories 读写命令)、`app.ts`(`GET /agents/:id/memories`)、web(`NPC 面板记忆层`、`检查器记忆页`) | 等主线 M5 收尾后进入,一次一会话 |
| 既有文件只读消费 | Mock 决策器与对话器加"记忆加成"钩子(在 mock-decision.ts / mock-dialogue.ts,接线时改) | 串行 |

### 10.2 事件写入与 M5 的依赖

- W2 读取 M5 已交付的 `event-propagation` 输出(Diffs:via/confidence/agentId,模块已在仓库)——**只读 import**;
- W3 依赖动作执行器(M5 后接线);W4 依赖世界时钟(已有);
- 因此纯逻辑先行无阻塞;接线按 M5 提交后顺序执行。

### 10.3 与并行切片的冲突检查

- 改 `db/*`、`shared/index.ts`、`app.ts` 均按"串行区一次一会话"执行——登记到注册表后再动;
- 纯函数新文件不与任何在途切片冲突(包 E 已交,新文件在 `apps/server/src/memory/` 全新目录)。

---

## 11. 需求映射(设计 → 决策原文)

| 决策 | 对应设计节 |
| --- | --- |
| D13 记忆基础 | §1、§3 |
| D14 认知扩展(近期/重要/相关性召回;反思) | §4、§5、§6 |
| D17 NPC 对话(双方各自主观记忆) | §3.3 W1 |
| D24 信息可见性(三层) | §1 |
| D39 状态表达(0-100 分级,UI 层) | §4 importance |
| D41 多维关系(印象摘要) | §1、§8.1 |
| D49 最小上下文(token 预算) | §6.5 |
| D51 AI 检查器 | §8.2 |
| D54 NPC 面板(记忆与决策分层) | §8.1 |
| D68 Mock 决策(效用+种子扰动) | §7.1 |
| D69 Mock 对话(含记忆检索) | §7.2 |
| D83 记忆检索(FTS5+评分,Embedding 预留) | §2.3、§6.2 |
| D96 面试持久化(刷新恢复) | §2.2(版本标注)、§9.2 I6 |

## 12. 明确不做(首版边界)

- 不做向量数据库/Embedding 检索(仅评分接口预留);
- 不做跨 NPC 的记忆共享(每 NPC 各自记忆,关系只经 relationships);
- 不做"记忆可视化因果图"(面板列表+理由即止);
- 不做完整 LLMOps(数据集/批量评测);
- 不做记忆遗忘的滑翔窗口压缩之外的心理学模型(如睡眠合并、强度衰减重演)。

---

## 13. 评审与优化记录（Claude B, 2026-08-28）

**总体评价**：设计扎实，覆盖 D13/D14/D17/D24/D41/D51/D54/D68/D69/D83 的关键闭环——三层存储分工、importance、召回评分、日复盘/insight、Mock 一致性、测试矩阵与串/并行划分都很到位，可直接作为实现依据。**判断：通过（有必要的前置修正与范围收敛）。**

**本记录针对性优化（已改到上文对应小节）**：

| 优化点 | 原问题 | 处理 |
| --- | --- | --- |
| ① FTS5/中文分词（§2.3、§6.3） | `unicode61` 对中文整段=单 token，2-gram 查询词命中率≈0；且 §6.1 已按 view 做纯内存评分，FTS 与内存匹配重复 | 改为 **MVP 纯内存 2-gram 匹配**，不建 FTS 镜像表；FTS 列为「>200 条时启用且须对入库内容 2-gram 化」的后续优化 |
| ② 新近度基准（§2.1、§6.2） | `created_at` 为墙钟，恢复/种子不可复现 | 新增 `world_minute` 列；recency 一律用世界分钟 |
| ③ 半衰期常量（§6.2） | `HALF_LIFE_DAYS=2880` 注释误标「1 世界日」（1 世界日=1440 游戏分钟） | 改为 `HALF_LIFE_WORLD_MINUTES=1440` |
| ④ DeepSeek/chat 约束（§4.1） | 新字段 `memoryImportance` 走 chat `json_object`，DeepSeek 不支持 json_schema 严格模式 | 注明 instructions 须显式写完整 JSON 形状（含 "json" 字样），与现有 `completeDialogue` 提示词改法一致 |

**范围收敛建议（保证「做扎实」同时可投产；按 MVP/打磨两级切）**：

- **MVP 核心（先做，可验收）**：W1（对话）/W2（事件）写入 + importance + `world_minute`；`retrieveMemories` 纯内存召回 → 注入对话/决策上下文；Mock 加成 + AI 一致性；NPC 面板「记忆列表 + 召回理由」。对应验收 P1–P4。
- **打磨级（其后）**：W3（行动）/W4（日复盘 summary + insight + 归档裁剪）、`recalledCount`（读路径写计数，建议做成尽力而为/异步，避免读放大）、`memoryImportance` AI 附注、FTS5、玩家侧记忆。
- 理由：MVP 即可达成「居民真的记得 + 可证明 + 无 Key 也成立」的演示主干，且不与其他在途切片（M5/M7）争热度；打磨项不阻塞验收。

**与在途切片的协同提醒**：§10 的串/并行边界正确；新增 `apps/server/src/memory/*` 为新目录，不与任何在途切片冲突。改动 `shared/index.ts`/`db/*`/`app.ts` 仍按「串行区一次一会话」登记后进行。

# 分发给并行 Agent 的提示词(2026-08-28)

> 用法:把对应包的提示词**整段复制**发给目标会话。
> 所有提示词假设对方是新会话(零历史),因此自包含。
> 公共须知已写进每段"必读与守则",不要删。

## 通用守则(每段都含,全文重复以自包含)

- 仓库:`/Users/xinyiji/Documents/ChatGPT/New project 2`,pnpm monorepo;先 `git log --oneline -3` 确认 HEAD 是否仍是 `87f70bf`(可能已被其他会话推进)。
- **禁止**:`git checkout --` / `git reset` / `git clean` / `git stash`(工作树有他人未提交代码,任何破坏性操作会毁掉他人工作)。
- 只 `git add` 你自己申报的文件;提交前必须 `pnpm install --frozen-lockfile`(若依赖缺失)并 `pnpm verify` 全绿。
- 先读 `docs/agents/README.md`(协调注册表)再动手;你的切片归属、文件区、解锁条件都在里面。
- **留痕**:进入切片时在 `docs/agents/` 新建三篇:`.requirement.md`(需求从哪来、验收)、`.plan.md`(步骤、影响文件、冲突规避)、`.execution.md`(初始勘察、执行记录、提交前填结论);并在注册表 README 表格加一行并勾销归属。文件名格式:`agent-<代号>-<YYYY-MM-DD>-<切片>.md`。
- 文档必须诚实:先区分"已实现/计划中/未做",不要用规划冒充成品。

---

## 包 C · M4-2 提交与补缺口(立即执行)

```text
你是 AI 蝴蝶小镇项目(腾讯 AI 全栈面试作业)的并行开发会话之一,代号 C,切片:M4-2 对话切片收尾与提交。

【必读与守则】先读仓库 docs/agents/README.md 与 docs/agents/agent-claude-2026-08-28-m4-2-dialogue.requirement.md(你的剩余缺口清单)。遵守其中"通用守则":禁止 checkout/reset/clean/stash;只 add 自己申报的文件;提交前 pnpm verify 全绿;在 docs/agents/ 补你自己的三篇痕迹文档(若尚未注册)。

【现状】分支 codex/day-1-vertical-slice,HEAD 87f70bf(若是,你的对话代码全在未提交区,verify 已绿)。你已完成的:对话 Schema/会话表/命令(executeStartDialogueCommand、sendDialogueMessage、endDialogue、 dialogueContext)/DialogueDecisionService(ai→修复→mock)/Mock 人格模板/参与者锁/4 路由/Web 对话抽屉与动画/测试。

【任务】
1. 补两个 M4-2 逻辑完整性缺口:
   a. 每条消息交换写 `dialogue.message` 事件并递增世界版本(参考 repository.ts 中 executeStartDialogueCommand/endDialogue 的事务模式:事件 insert + worlds.version+1 + worldBranches.headVersion 更新;事件 source 取 reply.source;payload 含 sessionId/npcId/replySource)。
   b. 把 DialogueDecisionService 产出的 trace 写入 ai_traces(与 sendDialogueMessage 同事务;仓库里已有 aiTraces insert 模式可参照)。
   c. 相应调整共享 Schema(DialogueReplyResultSchema 增加 world/event 字段)与前端 app 侧解析保持一致。
2. 更新 app.test.ts 对话集成用例:断言每条消息后 world.version 递增 + ai_traces 有记录(mock 模式也有)。
3. pnpm verify 全绿;浏览器回归(可选,Ego/devtools MCP):demo 登录 → NPC → 走近并交谈 → 发送 → 回复带 Mock 标记 → 结束。
4. 提交唯一一个 commit:
   `feat: add npc dialogue sessions with ai and mock fallback`
5. 提交后:更新注册表 README(你的行状态=已提交 hash;若你提交时发现工作树里还有不属于你的改动,只 add 你申报的文件并写明);在你的 execution.md 填"提交 hash + 验证结果"。

【禁止】不碰:docs/implementation-plan.md 状态行、.github/ scripts/ Dockerfile* (M9 归属)、apps/server/src/generation/ 的 M7 内部文件、apps/server/src/domain/event-propagation.*(D 会话)、docs/agents/ 内其他会话的文档(只读)。
```

---

## 包 D · M5 领域层(进行中,接任/确认版)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 D,切片:M5 步骤 2(领域层:事件传播范围与 Knowledge 生成,纯新增文件)。

【必读与守则】仓库 docs/agents/README.md(注册表,你的行);docs/agents/agent-claude-2026-08-28-m5-event-design.md 的 §1–§3(传播模型/知识差异/eventInfluence 因子,字段级规格在文内)。遵守"通用守则"。留痕:补你的三篇文档(若未写),文件名 agent-d-2026-08-28-m5-domain-layer.*。

【现状】若 apps/server/src/domain/event-propagation.ts 与 event-propagation.test.ts 已存在且测试全绿,则本包已完成——请只做只读校验(与设计规格 §2–§3 对照),在注册表把你的行状态改为"完成(已提交/待提交,写清)即可,不要再改动。
若不存在或未完成:
1. 按设计规格实现:`computeVisibility(fact, npcs)` → 每 NPC 的 knowledge 行(factJson/sourceEventId/confidence)、`eventInfluence(npc, facts, gameMinute)` → actionId→评分修正(Map),三种通道(public/witnessed/heard)规则用稳定噪声或无随机(固定 seed 可重现)。
2. 单测覆盖:三通道组合正确;无 knowledge 时影响恒 0;同一输入两次结果一致;confidence 分级(0.9/0.75/0.5)。
3. 只新增 src/domain/event-propagation.ts(+test),只读 import 共享类型;不碰 db/app.ts/shared。
4. pnpm verify 全绿后提交:
   `feat: add m5 event propagation domain logic with reproducible tests`

【禁止】不碰 event-propagation 之外的一切领域文件;不写 shared/db/app.ts。
```

---

## 包 E · M6/M8/M7 纯新增部件(现在就能开,与主线并行)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 E,切片:主线之外的"纯新增部件"——M6 快照纯逻辑、M8 AI 工作台页面组件、M7 世界创建页组件。

【必读与守则】仓库 docs/agents/README.md;docs/agents/remaining-work-map.md 的"包 E"行;docs/technical-design.md §6.4/§7.2(快照与恢复)、§10.1(六路由)。遵守"通用守则"。留痕三篇 agent-e-2026-08-28-*.md 并在注册表占位于"包 E"。

【硬规则】只新增文件、只读 import;**绝不修改** packages/shared/src/index.ts、apps/server/src/db/*、apps/server/src/app.ts、apps/web/src/App.tsx、根 package.json(这些是串行区,由主线 A 独占;路由登记由主线在你提交后统一补,你只需写好组件)。

【任务】
1. `apps/server/src/timeline/snapshot-logic.ts`(纯函数+单测):
   - shouldSnapshot(version, gameMinute, eventType, snapshotCount):每 60 世界分钟或重大事件(如 factory 事件)触发;
   - buildSkipSchedule(世界状态,目标分钟):跳过推进计划(紧急事件自动停止)——只做纯函数;
   - validateBranchRestore(snapshotChecksum, replayedChecksum):校验和一致判定;
   - 单测覆盖:周期触发、重大事件触发、跳过到达目标分钟、校验和不一致拒绝。
2. `apps/web/src/pages/AiLabPage.tsx`:AI 工作台页面组件——Trace 列表(按世界/NPC/角色/状态/降级)/详情卡片/重放表单/AI vs Mock 对比卡片;接口统一收在页面顶部一个 `AiLabApi = { listTraces, replay, compare, listWorlds }` 类型常量(注明"由主线接线替换为 services/api 真实方法"),组件 props 取该类型实例,默认导出带一个 `mockApi` 便于本地预览。
3. `apps/web/src/pages/NewWorldPage.tsx`:一句话创建页组件——输入/高级设置(人口、风格)/分阶段进度条/失败重试按钮;同样用 `NewWorldApi = { createWorld, getJob }` 契约常量。
4. tsc 绿(pnpm typecheck);页面组件不含运行时 API 调用(只走注入的契约);不做浏览器回归(Ego 无服务器支持,留主线)。
5. 提交:`feat: add m6 snapshot logic and world dev pages components`。

【禁止】新增文件之外不落任何一行到既有文件。
```

---

## 包 A · M5+M6 接线主线(串行区独占;触发条件:C 的 M4-2 已提交)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 A,切片:主线接线——M5 事件注入与因果链 + M6 快照/跳过/分支的服务端与前端接线。

【前置检查(不满足则报告等待,不要动手)】git log -1 不是 87f70bf(即有 M4-2 提交)且 pnpm verify 全绿;注册表 README 中包 C 状态=已提交;包 D 状态=完成(领域层已在)。

【必读与守则】docs/agents/README.md(你是串行区独占者:packages/shared/src/index.ts、apps/server/src/db/{schema,database,repository}.ts、apps/server/src/app.ts、apps/web/src/App.tsx);docs/agents/agent-claude-2026-08-28-m5-event-design.md(你的设计规格);docs/agents/agent-claude-2026-08-28-m4-2-dialogue.plan.md(原 M5 步骤 3–8,现在从 3 开始)。遵守"通用守则"。

【任务】
1. M5 Schema/Repository/路由:EventFact/Preview/Commit/causeIds 契约;preview 纯计算不写库;commit 事务(事件+knowledge+版本+幂等键);GET /timeline、GET /causal;错误码沿用现状格式;
2. M5 模拟注入:决策上下文加 knownEvents(mock 用 D 的 eventInfluence,AI 用已知事件摘要);下一 Tick 受影响 NPC 可见反应;
3. M5 前端:WorldPage 事件入口(3 模板+自由文本→预览→确认)+ CausalPage(列表/2级链路/过滤)+ App.tsx 路由 /world/:worldId/causal(如 E 未交付组件则你自写);
4. M6 接线(使用 E 的 snapshot-logic 或自写等价):周期/重大事件快照、跳过接口、历史恢复建子分支、世界库分支显示、最小导出导入(最小);
5. 验证:pnpm verify 全绿;web-devhandler 手动回归(登录→注入暴雨→≥2 NPC 计划改变→因果页两级链→刷新恢复);M5 验收 7 项全过;
6. 两个提交分别:M5 `feat: add event injection and causal timeline`;M6 `feat: add snapshots and basic timeline branching`(每提交后 verify 绿);
7. 更新注册表:勾销串行区占用,解锁包 F、H;更新执行文档结论。

【禁止】不碰 M9 工程文件(.github/scripts/Dockerfile/根 package.json/根 README);不碰 E 已交付的文件(只消费);不碰对话区文件(除非补齐 C 遗留缺口已由 C 处理)。
```

---

## 包 F · M7 接线(触发:A 已完成 M5/M6 提交并释放,注册表可见)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 F,切片:M7 世界生成接线(WorldGenerator 接入运行时)。

【必读与守则】docs/agents/README.md;docs/agents/remaining-work-map.md"包 F";docs/technical-design.md §6.4(分阶段 Job);apps/server/src/generation/world-generator.ts 与 world-structure.ts(已存在内部实现+单测,复用,勿重写);docs/agents/agent-claude-2026-08-28-m9-delivery.* 中"M7 追加"记录。遵守"通用守则"。留痕三篇。

【任务】
1. 表与迁移:jobs/job_attempts/assets(参考技术方案 §7.1 字段:task_id/world_version/stage/input_hash/result_ref);
2. Worker 租约:单进程 SQLite 队列,阶段可恢复(重启从最后完成阶段继续尝试一次),失败重试后程序化降级;
3. 路由:POST /generation/jobs(一句话+高级设置)、GET /generation/jobs/:id、POST /:id/retry;世界创建页接入(消费 E 的 NewWorldPage 组件或自建);
4. WORLD Provider:模板+固定 seed 生成可玩世界(无 Key 可用);IMAGE/VISION 真实 HTTP 接口(可只实现 IMAGE 缓存与失败降级,标注 VISION 契约);
5. 端到端:生成世界→进入→可运行(5 NPC);
6. 验证:pnm verify 全绿 + 手动/DevTools 回归(输入一句话→进度→进入新世界→刷新恢复);提交:`feat: add recoverable world generation pipeline`。

【禁止】不碰既有内置世界(demo 种子)逻辑;不碰 M5/M6 路由;串行区改动需在注册表登记占用并在提交后勾销。
```

---

## 包 G · M9 工程残余(B 会话延续)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 G(可视为 B/M9 会话的延续),切片:M9 工程残余。

【必读与守则】docs/agents/README.md(你的包 G 行与文件区:.github/ scripts/ Dockerfile* 根 package.json 根 README 已归你);docs/agents/agent-claude-2026-08-28-m9-delivery.*(已交付:CI/delivery:check/Docker/compose/README/M7 内部)。遵守"通用守则"。

【现状】pnpm verify 现绿、delivery:check 已可跑通(M4-2 提交后最终回归一次);Docker 容器化被 packages/shared 以 src 导出阻塞。

【任务】
1. `test:ai` 契约测试:四角色各一条结构化输出断言,显式 RUN_AI_TESTS=1 才触发(新文件 + 根脚本);
2. Playwright E2E 骨架:`playwright.config.ts` + e2e/login-world-dialogue.spec.ts(登录→观察→移动→对话→刷新恢复,Mock 模式),加入 delivery:check 或独立脚本;
3. 故障注入测试(server 新测试文件):AI 超时/坏 JSON、事务失败、Job 重启恢复;
4. Docker 真容器化:先做架构决策备忘——"packages/shared 由 src 导出改为 dist 导出"会影响所有会话的构建链,写出变更清单并在 docs/agents/README.md"待决架构"登记,与主线 A 确认后再实施;实施后 docker compose up 自检;
5. 验证:pnm verify 全绿,E2E 核心链路绿;提交:分提交(每条链路一个):`test: add ai contract and failure injection tests`、`test: add offline e2e for core journey`、`chore: make docker containerization work`(末条含架构备忘)。

【禁止】OpenAPI 留给包 H(等路由冻结);不碰服务端运行时路由文件(除了你自己的测试文件)。
```

---

## 包 H · OpenAPI(触发:主线路由冻结,即 A/F 提交后)

```text
你是 AI 蝴蝶小镇项目的并行开发会话,代号 H,切片:M9 OpenAPI 自动生成。

【前置】git log 已含 M5/M6(或 M7)提交且 verify 绿;否则报告等待。

【任务】
1. 为现有 Fastify 路由补全/抽取 Route Schema(改 app.ts 时在注册表登记"临时修改",完成后勾销);
2. 生成脚本:`scripts/openapi.mjs`(从 buildApp 的 route schemas 输出 OpenAPI 3.1 文档 docs/openapi.yaml)与根脚本 openapi:gen(根 package.json 归 G,如需改请 G 添加或授权);
3. 校验:生成的文档覆盖全部服务端路由且可被 fastify 服务暴露 /api/docs(只读);
4. verify 绿;提交:`chore: add generated openapi documentation`。

【禁止】不改任何行为逻辑;只补 schema 元数据与导出。
```

---

## 分配速查(发给用户自己看)

| 包 | 提示词 | 触发 | 建议发出对象 |
| --- | --- | --- | --- |
| C | 上文"包 C" | 立即 | 当时在写 M4-2 的那个会话 |
| D | 上文"包 D" | 立即(确认/接任) | 做 M5 领域层的会话(如未派先派) |
| E | 上文"包 E" | 立即 | 新开一个会话 |
| A | 上文"包 A" | C 提交后 | 主线会话(本会话或新开) |
| F | 上文"包 F" | A 提交后 | 新开一个会话 |
| G | 上文"包 G" | 立即 | 做 M9 的 B 会话 |
| H | 上文"包 H" | F 提交后 | 新开一个会话 |

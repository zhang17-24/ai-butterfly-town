# 需求文档 · M4-2 对话切片收尾与提交(C 会话接任者,2026-08-28)

- **Agent**:claude C 会话接任者(用户指派;原 C 会话未注册,工作树未提交)
- **负责切片**:M4-2 对话切片收尾(补两个逻辑缺口)+ 提交
- **基线**:A 会话 M4-2 需求文档记录的剩余缺口;注册表《当前状态快照》

## 1. 缺口清单(来源:A 的执行文档 §1 + 注册表)

1. **对话消息事件与版本递增**:每条消息交换(sendDialogueMessage)写 `dialogue.message` 事件并递增世界版本(参照 executeStartDialogueCommand/endDialogue 事务模式:事件 insert + worlds.version+1 + worldBranches.headVersion;事件 source 取回复 source;payload 含 sessionId/npcId/replySource);
2. **Trace 入库**:DialogueDecisionService 已产出 `decided.trace`(role=DIALOGUE),但 app.ts 未传给 repository,丢弃 → 与消息写入同事务存 ai_traces(参照 commitTick newTraces 插入模式);
3. **Schema 同步**:DialogueReplyResultSchema 增加 `world`/`event`;前端经 `api.ts` 的 `DialogueReplyResultSchema.parse` 自动兼容(无独立类型需要改)。

## 2. 验收标准(集成测试可证)

1. 发送一条消息后响应 `world.version === 对话开始后版本 + 1`;
2. 响应 `event.type === "dialogue.message"`、`source === reply.source`(mock 模式为 "mock")、payload 含 sessionId/npcId;
3. `ai_traces` 中新增一条 agentId=npcId、role=DIALOGUE 的记录(mock 模式同样写入);
4. `pnpm verify` 全绿(含既有对话集成用例不退化)。

## 3. 边界

- 不做 M4-2 之外的功能;不触碰 B(M9/M7)、A(M5)、D(事件传播)文件区域;
- 提交只包含本切片申报文件;其余未提交工作(根 package.json/README/.github/scripts 等 B 区,D 区 event-propagation/event-preview)留给各自会话;
- TownScene 中间态(03:01 web typecheck 红)已由 C 在 03:02 修完,收尾核实即可,无需变更。

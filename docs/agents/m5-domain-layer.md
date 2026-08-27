# M5 领域层(D 会话,2026-08-28,交付待提交)

- **交付**:`apps/server/src/domain/event-propagation.ts`(+ test,12 用例)与 `domain/event-preview.ts`(+ test);server 全量 51/51 绿。
- **传播规则** `computeKnowledgeSpread(spec, npcs, blueprint?, {sightRadius, hearingRadius}) → KnowledgeDiff[]`:involved 恒知(100)/ public 全镇(95)/ local 按目击半径 ≤120px(90±curiosity)与可听半径 ≤300px(75±sociability)/ private 仅涉事;置信 clamp [70,100],对齐 `knowledge` 表列(factJson/sourceEventId/confidence);`alreadyKnowsFact` 供幂等。
- **预览器** `buildEventPreview(text, {nowMinute, blueprint})`:类型词表(天气/紧急/市集/社交/公告/社区)、静态地点别名、audience 规则(公开词→public、私下词→private、默认 local)、时间 HH:MM 与"X点(半)"中文数字转换;预览 id 由文本 hash 生成,恒等输出。
- **消费方式**:M5 步骤 3(Repository/路由)直接使用上述函数;文件由主线 A 提交时一并纳入(git add 指定路径,勿用 `-A`)。
- **边界**:不写库、不挂路由、不碰其他会话文件。

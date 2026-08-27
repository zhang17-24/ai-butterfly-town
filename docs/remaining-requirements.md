# 需求完成状态 · AI 蝴蝶小镇(2026-08-28 交付态)

> 基线:`docs/living-requirement-map.html`(Living Requirement Map v1.5)。
> 本文记录每条验收证据,取代中途的「待完成」版本。

## 一、主线功能 — 全部完成 ✅

| 模块 | 需求 | 证据 |
| --- | --- | --- |
| M1–M3 世界骨架 | D01–D12/D37/D39/D40 | 栖溪镇 5 NPC 每 2s 一世界分钟;状态 0–100 五维 |
| 自主决策 | D47/D48/D50/D51 | 候选受限→AI 选择→Schema 校验(修复一次)→Mock 降级;AiTrace 全记录 |
| 玩家 | D18–D22 | 居民实体、A* 逐格移动(跨桥/绕行)、自动接近、对话 |
| 对话 | D17/D26(部分) | 会话表+命令+AI/Mock 双轨;**对话参与者锁**;突发中断仅预留 |
| 事件注入 | D23/D24/D25/D55/D57/D97/D122 | 预览(解析+分层传播预估)→确认提交(单事务+版本+幂等)→knowledge 三层通道→因果页/时间线 |
| 记忆 D13/D14 | ⭐ 重点 | 三层记忆(经历/事件/行动+摘要)+importance 规则分+按 4 因子召回(命中词/重要度/新近/对象)+理由可解释;**注入对话与决策同一 Prompt**;Mock 引用旧经历;面板记忆层+召回理由;AI/Mock 同一 retrieveMemories 实现 |
| M6 时间 | D38/D64/D66(基础)/D96 | 周期(60 分钟)+重大事件快照;**跳过时间后台作业**(紧急事件提前停+暂停恢复);分支创建(快照回滚+切换 branchId);初始快照+恢复 |
| M7 动态世界 | D53/D92/D29(基础)/D31(降级)/D34/D35/D36 | 一句话创建(POST /worlds,六阶段作业:结构→校验→程序化地图→寻路→入库);人口 3–20;种子确定性;能力标签校验;扩建/室内深度/真实生图=V2 路线 |
| M8 调试台 | D98(部分) | /dev/ai AiLab:世界/居民/角色过滤、Trace 详情、重放/对比(节流版) |
| 工程 | D73–D90/D99/D101/D108 | TS monorepo、Fastify+SQLite WAL、REST+WS、Zod/Drizzle、网格 A*、登录、测试 127 项、CI(lint+typecheck+test+build) |
| M9 交付 | D100/D102/D107/D109/D111 | 路由全集(创建/因果/调试);**shared dist 导出修复(Docker 验证)**;OpenAPI 自动生成 /api/openapi.json;delivery:check 清单;决策账本在 docs |
| 真实 AI | D46(部分)/D71 | 决策+对话真实 DeepSeek(json_object 模式),test:ai 3/3(含 Seedream 生图);Key 缺失/失败自动 Mock |
| E2E | D70 | scripts/e2e-smoke.ts 10/10;浏览器全流程(登录→地图→AI 对话→事件因果→跳过→分支→建世界→AiLab)验收通过 |

## 二、人工事项(唯一剩余,非代码)

1. **GitHub 建仓+推送**:在 github.com/zhang17-24 建空仓库 `ai-butterfly-town`(或提供 GITHUB_TOKEN),然后 `bash scripts/release-git.sh`(ssh 密钥已配)。
2. **Render 部署**:账号面板按 `docs/delivery.md` 方式 B(render.yaml 样例 + 面板粘贴 envVars)。
3. **录制视频**:3–5 分钟分镜+讲解词见 `docs/delivery.md` §5。
4. 正式演示前重置世界:`rm -f apps/server/data/ai-town.db*`(保留默认世界干净开局)。

## 三、项目亮点(讲给面试官)

- **同一套治理链**:决策/对话/事件全部「结构化输出校验→失败降级 Mock→Trace 留痕」,无 Key 完整体验。
- **蓝图为权威**:坐标/寻路/可视全部同源,AI 生图(Seedream)只作外观增强层。
- **记忆系统真正闭环**:写(三类来源+importance)→存(world_minute 可复现)→取(4 因子+可解释理由)→用(同一回忆进 Mock 与 AI Prompt)→证(面板/Trace/测试)。
- **世界即版本链**:事件版本+分支+快照,支持"重来"。
- **交付完备**:Docker 单容器、OpenAPI、CI、E2E 脚本、真实 AI 契约测试。

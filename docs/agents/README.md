# Agent 并行协调注册表

本目录是并行开发时每个 Agent 留下的痕迹。**进入本仓库做任何修改前,先看本目录和 git 工作树状态。**

## 正在进行的 Agent

| Agent | 当前切片 | 文档 | 状态 |
| --- | --- | --- | --- |
| claude A 会话 | M5 事件注入与因果链(等 M4-2 提交后启动) | [需求](./agent-claude-2026-08-28-m4-2-dialogue.requirement.md) · [计划](./agent-claude-2026-08-28-m4-2-dialogue.plan.md) · [执行](./agent-claude-2026-08-28-m4-2-dialogue.execution.md) · [设计规格](./agent-claude-2026-08-28-m5-event-design.md) | 规格已就绪,监控中 |
| claude B 会话(M9 交付) | CI/Docker/delivery:check/README(仅新增文件) | [需求](./agent-claude-2026-08-28-m9-delivery.requirement.md) · [计划](./agent-claude-2026-08-28-m9-delivery.plan.md) · [执行](./agent-claude-2026-08-28-m9-delivery.execution.md) | 工程件完成,等 M4-2 提交后回归 |
| claude C 会话(M4-2,未注册)→ 接任者收尾 | 完成 M4-2 对话切片 | [需求](./agent-claude-2026-08-28-m4-2-submission.requirement.md) · [计划](./agent-claude-2026-08-28-m4-2-submission.plan.md) · [执行](./agent-claude-2026-08-28-m4-2-submission.execution.md) | 接任者收尾:补缺口(消息事件+版本、trace 入库、Schema/前端),提交主 commit(见文末 hash) |
| claude D 会话(Codex 接任) | M5 步骤 2/2.5 领域层+Mock 事件预览器(纯新增文件) | [需求](./agent-claude-2026-08-28-m5-domain-layer.requirement.md) · [计划](./agent-claude-2026-08-28-m5-domain-layer.plan.md) · [执行](./agent-claude-2026-08-28-m5-domain-layer.execution.md) | 进行中:步骤 2 已交付(45/45);2.5 预览器开发中 |

> C 请见本表后补注册;若 C 停止活动,按下方"提交规则"由 A 代为接管提交与收尾。

## 当前状态快照(2026-08-28 02:54)

- 分支 `codex/day-1-vertical-slice`,HEAD `87f70bf`;**M4-2 尚未提交**。
- **`pnpm verify` 已全绿**:8 个测试文件 33 个用例全过,build 成功(仅 Phaser 大包告警,已知债)。
- C 的关键修正:NPC 出生点/目的地从建筑内部移到可走格(可达性根因);`packages/shared/src` 导出 `qixiBlueprint/qixiPixelStyle` 已补齐。
- M4-2 剩余缺口(按 A 需求文档):① 消息交换 `dialogue.message` 事件+世界版本递增;② `decided.trace` 入 `ai_traces`。**均不影响 verify;属逻辑完整性,提交后仍可补。**

## 任务分配(三方)

| 责任方 | 任务 | 触发条件 | 完成判据 |
| --- | --- | --- | --- |
| C / 接任者 | M4-2 提交:`feat: add npc dialogue sessions with ai and mock fallback`(或等价描述) | 立即(verify 已绿) | HEAD 变化,branch 有新提交 |
| B | M9 回归:`pnpm delivery:check` + Docker 构建;更新 B 执行文档 | M4-2 提交后 | 脚本通过(或如实记录阻塞) |
| D(本会话) | M5 步骤 2:领域层传播纯函数+单测(新增文件) | 立即(无冲突) | verify 绿 + 单测覆盖验收 7 项 |
| A | M5 步骤 3 起(Schema/Repository/路由→因果页→暴雨模板→提交) | M4-2 提交后 | 见 A 计划文档;**步骤 2 由 D 完成,勿重复** |

## 提交规则(避免"绿了就晾着")

1. M4-2 验证通过但 **2 小时内无人提交** → A 在监控触发时向用户确认后,按"已完成形态"代为提交(commit 注明来自 C 的工作树),并在注册表勾销。
2. **红状态优先**:谁制造的红谁负责变绿;24 小时无人清理则 A 接管收尾。
3. 提交后各自更新执行文档,其他会话才可进入该文件范围。

## 冲突规则

1. **文件归属(当前)**:
   - M4-2 对话区(app.ts 对话路由、repository 对话命令、ai/dialogue-decider.*、dialogue/、db 表、shared 对话 Schema、web 对话 UI、domain/seed.ts、domain/mock-decision.ts)= **C/接任者**;
   - M9 工程区(`.github/`、`scripts/`、`Dockerfile`、`docker-compose.yml`、`.dockerignore`、根 `package.json`、根 `README.md`、`packages/shared/package.json`)= **B**;
   - M5 事件注入区 = **A**(见 A 计划文档;提交后启动)。
2. **修改对方文件**:先在各 Agent 执行文档记一行"XX 文件因 Y 原因由本会话临时修改",再改。
3. **可安全并行**:docs/agents/* 任意会话可编辑(协作面);`docs/implementation-plan.md` 状态行更新留待主干合并时统一。

## 退出约定

切片的执行文档出现"已提交 <commit hash>",且 `git status` 干净后,其他 Agent 才可进入该文件范围。

## 进展更新(2026-08-28, B 会话)

- B 会话在 M9 交付之外,追加完成 **M7 世界生成管线内部文件**:`generation/world-structure.ts`(类型/校验/模板/初始状态)、`generation/world-generator.ts`(6 阶段编排 `WorldGenerator`)+ 6 单测,server tsc 绿、generation 9 tests 全绿(离线)。
- 痕迹:[M7 生成内部](./agent-claude-2026-08-28-m7-generation-internals.md)。
- 影响面:仅 `apps/server/src/generation/` 新增文件;不占 `db`/`app.ts`/`navigation`(只读 import)/`shared`(只读 import)。后续 M7 接任者可直接消费 `WorldGenerator` → `WorldPackage`。
- M9 状态:verified that `pnpm verify` 现绿→ `delivery:check` 可跑通;Docker 仍受 `packages/shared` 以 `src` 导出影响,真正容器启动需先改该包为 `dist` 导出(跨切片,待统一裁定)。

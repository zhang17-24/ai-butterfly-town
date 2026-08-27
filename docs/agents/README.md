# Agent 并行协调注册表

并行开发时每个会话留下的痕迹。**进仓库改代码前先看本表。**

## 文档索引

| 文档 | 用途 |
| --- | --- |
| `docs/living-requirement-map.html` | 需求基线 v1.5(只读) |
| `docs/remaining-requirements.md` | **剩余需求清单**(按 D 编号,当前缺口权威) |
| `docs/technical-design.md` / `docs/implementation-plan.md` | 架构方案 / 里程碑验收 |
| `docs/agents/m5-event-design.md` | M5 设计规格(主线依据) |
| `docs/agents/agent-prompts-2026-08-28.md` | 批量派发提示词(派发完成后归档) |
| `docs/agents/archive-2026-08-28.md` | 已完结切片记录(每段 1–3 句,原三篇痕迹已收卷) |

## 当前会话

| 会话 | 切片 | 状态 |
| --- | --- | --- |
| A | M5 主线:接线+前端+暴雨模板(串行区独占) | ⚡ 已解锁(M4-2 已提交),进行中 |
| B | M9 工程残余(test:ai/E2E/故障注入/Docker dist 导出)+ M7 内部(已交付) | 主体完成,等 A 后回归 |
| C 接任者 | M4-2 收尾提交 | ✅ 完成:`f7a7cc4`(代码)+ `71151d2`(本表) |
| D | M5 领域层与提交命令(domain/event-* + repository commit) | 步骤 2 已交(45/45);**03:18 起进入串行区改 repository.ts,中间态 typecheck 红**;其他会话暂莫动串行区 |
| E | M6 纯逻辑+页面组件(`timeline/snapshot-logic.ts` 已落地) | 进行中 |

## 状态快照(2026-08-28 03:16)

- HEAD `71151d2`;**M4-2 已提交**,对话完整(消息事件+版本、trace 入库、可达性修正)。
- 工作树未提交:B 的 M9 工程件(`.github/`、scripts、Dockerfile、compose、根 package.json/README)、D 的 `domain/event-*.ts`、E 的 `timeline/`、精灵图 PNG、`docs/agents/*` 痕迹。

## 串行区(一次只允许一个会话修改)

`packages/shared/src/index.ts`、`apps/server/src/db/{schema,database,repository}.ts`、`apps/server/src/app.ts`、`apps/web/src/App.tsx`、根 `package.json`(归 B)。
同时:`apps/web/src/pages/WorldPage.tsx`、`services/api.ts`、`state/world-store.ts`、`game/TownScene.ts`、`styles.css` 属 M5 主线区,他人勿动。
纯新增文件/只读 import 均可并行。

## 任务分配

| 任务 | 责任 | 触发 | 判据 |
| --- | --- | --- | --- |
| M5 接线+因果页+暴雨模板 | A | 已解锁 | M5 验收 7 项 + verify 绿 |
| M6 接线(快照/跳过/分支) | A(M5 后) | M5 提交后 | 实施规划 §10 验收 |
| M7 接线(Post /worlds、jobs、worker) | 新会话 | A 释放后 | 一句话生成可玩世界且可恢复 |
| M9 残余 | B | 并行 | delivery:check + E2E 绿 |
| OpenAPI | 新会话 | 主线路由冻结后 | 覆盖全部路由 |

## 守则

1. **禁止** `git checkout --` / `reset` / `clean` / `stash`;只 `git add` 自己申报的文件;提交前 `pnpm verify` 全绿。
2. 已完结切片:执行记录进 `archive-2026-08-28.md`(一段),不再单列三篇。
3. 修改他人区文件:先在本表登记一行再改。
4. 红状态优先:谁制造谁负责;24h 无人清理由 A 接管。
5. 退出约定:执行文档出现"已提交 <hash>"且工作树干净后,文件区才释放。

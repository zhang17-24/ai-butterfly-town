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

## 当前会话(2026-08-28 04:20 收官快照)

| 会话 | 切片 | 状态 |
| --- | --- | --- |
| M4-2(C 接任) | 对话切片 | ✅ `f7a7cc4` |
| M5(A 包) | 事件注入+因果链 | ✅ `0bce62d` |
| M6/M7/记忆系统接线 | 快照·跳过·分支 / 一句话生成(jobs+procedural PNG) / D13–D14 记忆全链 | ✅ `ea1339c`(127 测试中 103 项本轮并入) |
| M9 交付 | OpenAPI D109 / test:ai D71(3/3) / e2e-smoke D70(10/10) / shared dist exports D102 | ✅ `a1f95d4` |
| 收尾会话(活动) | lint(eslint.config.mjs)、delivery.md、ci.yml 细化、WorldPage/styles 微调 | 工作树未提交,进行中 |

## 状态快照(04:20)

- HEAD `a1f95d4`;**pnpm verify 全绿:19 测试文件 127 用例 + 全量 build**(web 4.4s)。
- 并行会话主体全部落地;剩余为 M9 收尾件(lint/文档/微调)与面试件(浏览器全流程手测、D103 线上、D104 视频、D107 决策账本)。
- 未提交(收尾会话):eslint.config.mjs、docs/delivery.md、.github/ci.yml、scripts/delivery-check.mjs、WorldPage.tsx/styles.css 微调、根 package.json/lock、docker-compose.yml;B 的 docs 类(living-requirement-map.html、remaining-requirements.md、memory-system-design.md)仍未提交。

## 串行区

上表提交完成后**无专属占用**;收尾会话仅动前端页面与工程件。需要新路由时按守则先登记。

## 任务分配(仅剩)

| 任务 | 责任 | 触发 | 判据 |
| --- | --- | --- | --- |
| lint/交付文档收尾 | 收尾会话(进行中) | 并行 | delivery:check + lint 绿 |
| 浏览器全流程手测(登录→观察→移动→对话→注入→因果→跳过→分支→生成→恢复) | 待派 | lint 提交后 | 六核心路由走通 |
| D103 线上部署 / D104 视频 / D107 决策账本 + AI 案例 | 用户侧 | 最终 | README/视频/线上地址 |
| Definition of Done 复核 | 任一 | 全部提交后 | 实施规划 §20 |

## 守则

1. **禁止** `git checkout --` / `reset` / `clean` / `stash`;只 `git add` 自己申报的文件;提交前 `pnpm verify` 全绿。
2. 已完结切片:执行记录进 `archive-2026-08-28.md`(一段),不再单列三篇。
3. 修改他人区文件:先在本表登记一行再改。
4. 红状态优先:谁制造谁负责;24h 无人清理由 A 接管。
5. 退出约定:执行文档出现"已提交 <hash>"且工作树干净后,文件区才释放。

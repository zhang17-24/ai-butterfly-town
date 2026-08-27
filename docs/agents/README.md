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

## 当前会话(2026-08-28 04:40 收官)

| 会话 | 切片 | 状态 |
| --- | --- | --- |
| M4-2(C 接任) | 对话切片 | ✅ `f7a7cc4` |
| M5(A 包) | 事件注入+因果链 | ✅ `0bce62d` |
| M6/M7/记忆系统接线 | 快照·跳过·分支 / 一句话生成 / D13–D14 记忆全链 | ✅ `ea1339c` |
| M9 交付 | OpenAPI/test:ai(3/3)/e2e(10/10)/dist exports | ✅ `a1f95d4` |
| 收尾 | web UI 接线+lint 门+交付文档 | ✅ `be8777a` / `809d67c` / `ad6530f` |

## 状态快照(04:40 最终)

- HEAD `ad6530f`;**工作树干净**;`pnpm verify` 全绿:19 测试文件 127 用例 + 全量 build(web 2.4s);lint 0 errors / 15 warnings。
- **M1–M9 主体全部落地**,剩余全为面试交付面:D103 线上部署、D104 演示视频、D107 决策账本/AI 案例、浏览器全流程手测(可选)、Definition of Done 复核。

## 串行区 / 任务分配

- 串行区无占用;全部代码切片已提交。
- 仅剩人工/用户侧项:线上部署+演示视频+账本(见 docs/delivery.md 部署与录制脚本)。

## 守则

1. **禁止** `git checkout --` / `reset` / `clean` / `stash`;只 `git add` 自己申报的文件;提交前 `pnpm verify` 全绿。
2. 已完结切片:执行记录进 `archive-2026-08-28.md`(一段),不再单列三篇。
3. 修改他人区文件:先在本表登记一行再改。
4. 红状态优先:谁制造谁负责;24h 无人清理由 A 接管。
5. 退出约定:执行文档出现"已提交 <hash>"且工作树干净后,文件区才释放。

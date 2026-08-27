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
| A 包(主线派发) | M5 事件注入+因果页+暴雨模板 | ✅ **已提交 `0bce62d` + `f95f7f4`**(预览/提交/传播/模拟注入/前端/因果页齐全) |
| B | M9 工程残余(test:ai/E2E/故障注入/Docker dist 导出)+ M7 内部 | 主体完成,等全部合并后最终回归 |
| C 接任者 | M4-2 收尾提交 | ✅ `f7a7cc4` |
| D | M5 领域层(并入 0bce62d) | ✅ 步骤 2 交付 |
| E | **记忆系统(D13/D14)**:`memory-system-design.md` + `src/memory/{caption,summarize,retrieval,importance,mock-decision-bonus}` | 进行中;**memory 中间态 typecheck 红(importance.ts:37),归 E** |
| 活跃未注册会话 | 客户端行走/精灵修复 + 对话 AI 文件 | 已提交 051acd5/68e202f/8caf6db;工作树仍有未提交(provider/dialogue 等) |

## 状态快照(2026-08-28 03:50)

- HEAD `c166353`(本表更新后);M4-2 `f7a7cc4` → M5 `0bce62d` 已提交;**M1–M5 全部贯通**。
- 未提交:E 的 `src/memory/*`(设计+9 代码文件+测试,进行中)、B 类工程件(部分已提交)、活跃会话的 provider/dialogue/README 改动、`docs/living-requirement-map.html`、`docs/remaining-requirements.md`、`docs/agents/memory-system-design.md` 等痕迹。
- 当前红:`memory/importance.ts`(中间态,归 E);与其无关,其他会话勿碰该目录。

## 串行区(一次只允许一个会话修改)

`packages/shared/src/index.ts`、`apps/server/src/db/{schema,database,repository}.ts`、`apps/server/src/app.ts`、`apps/web/src/App.tsx`、根 `package.json`(归 B)。
**M5 已提交 → 串行区已释放**,任一会话进入前先在本表登记。纯新增文件/只读 import 均可并行。

## 任务分配

| 任务 | 责任 | 触发 | 判据 |
| --- | --- | --- | --- |
| M6 接线(快照/跳过/分支;E 已备 snapshot-logic 纯函数) | 新主线会话 | 已释放 | 实施规划 §10 验收 |
| M7 接线(Post /worlds、jobs、worker;B 已备生成器) | 新会话 | 可与 M6 排队 | 一句话生成可玩世界且可恢复 |
| 记忆系统接线(消费 E 的 memory/*) | E 或其接任 | E 完成后 | D13/D14 检索+摘要+反思 |
| M9 残余 | B | 并行 | delivery:check + E2E 绿 |
| OpenAPI | 新会话 | 主线路由冻结后 | 覆盖全部路由 |

## 守则

1. **禁止** `git checkout --` / `reset` / `clean` / `stash`;只 `git add` 自己申报的文件;提交前 `pnpm verify` 全绿。
2. 已完结切片:执行记录进 `archive-2026-08-28.md`(一段),不再单列三篇。
3. 修改他人区文件:先在本表登记一行再改。
4. 红状态优先:谁制造谁负责;24h 无人清理由 A 接管。
5. 退出约定:执行文档出现"已提交 <hash>"且工作树干净后,文件区才释放。

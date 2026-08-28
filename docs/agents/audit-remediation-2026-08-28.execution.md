# 审计修复迭代实现方案 · R1

> 对应需求：`audit-remediation-2026-08-28.requirement.md`

## 1. 数据流调整

### 1.1 每世界 Blueprint

统一增加内部读取方法 `getSimulationBlueprint(worldId)`：

1. 查询 `worlds.blueprint_json`；
2. 有值时解析并通过 `WorldBlueprintSchema` 校验；
3. 内置旧世界无值时回退 `qixiBlueprint`；
4. Simulation、Player Move、Dialogue Approach、Event Preview/Spread 都调用这一入口。

这样逻辑几何仍由数据库中的 Blueprint 权威控制，美术图片不会参与碰撞和寻路。

### 1.2 能力驱动动作目的地

`getActionCandidates` 接收可选 Blueprint。每类动作按能力选择地点：

| 动作 | 首选能力 | 兜底 |
| --- | --- | --- |
| 进食 | `eat` | 出生点 |
| 休息 | `rest` | 出生点 |
| 工作 | `work` | 当前地点/出生点 |
| 社交 | `social` | plaza/outdoor |
| 散步 | outdoor/plaza | 出生点 |

建筑使用入口作为目的地，室外地点使用边界中心；所有点再经当前世界导航网格校正为最近可走点。

### 1.3 因果来源选择

决策器在计算事件加分时，同时记录“哪些已知事件对最终动作产生非零影响”，写入 Trace 上下文的 `causalEventIds`。Simulation 生成行动事件时将其复制到 `causeIds`。

第一版保持保守：仅关联已经进入该 NPC Knowledge 且确实影响最终动作评分的事件，不通过文本相似度猜测额外边。

## 2. 稳定性修复

### 2.1 社交配对

不再使用 `while (b === a)` 重抽。先选 A 的下标，再从长度为 `n-1` 的空间选择 B，必要时将下标跨过 A；保证常数时间结束。

### 2.2 长时状态

- 极端饥饿和精力使用额外阈值加分，压过普通工作/社交候选；
- 日期显示使用 `周六 + floor(gameMinute / 1440)`；
- StateBar 增加“充足/一般/紧张/危险”等文案，数值仍保留。

## 3. 代码落点

- `apps/server/src/db/repository.ts`：每世界 Blueprint 读取、移动/接近/传播接线；
- `apps/server/src/app.ts`：事件预览使用目标世界 Blueprint；
- `apps/server/src/domain/mock-decision.ts`：能力驱动目的地与极端状态；
- `apps/server/src/ai/simulation-decider.ts`：Blueprint 输入及因果事件选择；
- `apps/server/src/simulation/simulation-service.ts`：每世界网格与 `causeIds`；
- `apps/server/src/simulation/npc-socialize.ts`：常数时间配对；
- `apps/web/src/pages/WorldPage.tsx`：动态日期和状态等级；
- 对应 Vitest/API 集成测试。

## 4. 实施顺序

1. 先修社交死循环，恢复测试反馈回路；
2. 接入每世界 Blueprint 和能力目的地；
3. 接通事件影响到行动的因果 ID；
4. 修日期与极端状态表达；
5. 跑离线测试、构建、HTTP E2E、浏览器回归；
6. 将真实结果回填本文件。

## 5. 风险与回滚边界

- 不改变数据库表结构，旧数据库无需迁移；
- 保留 `qixiBlueprint` 回退，确保内置世界行为不变；
- 不修改未提交 Seedream Provider 的接口与内容；
- 如果能力标签缺失，动作落到当前地点或出生点，不允许越界坐标。

## 6. 执行记录

- 状态：实施中。

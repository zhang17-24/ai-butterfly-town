# 体素 3D 小镇改造设计

**状态**：设计已确认，待写实现规划
**日期**：2026-09-23
**影响范围**：`apps/web` 渲染层。`apps/server`、`packages/shared` 不改。

---

## 1. 背景与目标

现状：栖溪镇是 2D 俯视像素风。地图是一张 Seedream 生成的 900×620 烘焙全图（`qixi-town-prebuilt-v1.png`，3.2MB），居民是 6×5 像素精灵表（左/前/背行走 + 待机 + 表情），渲染由 Phaser 3 承担。

目标：把渲染层换成**真 3D 体素风格**，相机可 360° 自由环绕，居民是代码生成的体素模型，光照跟随世界时间。

三条约束（用户已确认）：

1. **保留像素身份** —— 不切换到写实或通用低多边形风格，延续 `qixiPixelStyle` 锁定的 8 色调色板。
2. **自由转相机** —— 这是选型前提，排除了"精灵图挤体素"这种只在 4 个方向成立的方案。
3. **代码生成体素人** —— 不引入 MagicaVoxel / Blender / 外部体素资产包。角色由参数化人体模板 + NPC 调色板在运行时代码生成。

动因：2D 版已交付（M1–M9），3D 是观感与叙事表现力的升级，同时是面试演示的差异化点（"AI 生成世界 + 自研体素渲染管线"）。

---

## 2. 范围与非范围

### 在范围内

- 3D 体素渲染层，功能与现有 2D 对等：选人、对话气泡、点地移动、暂停/跳过/分支、行走区域高亮。
- 相机自由环绕（方位角 360°，俯仰受限）。
- 体素角色：程序化生成 + 程序化走路摆动 + 连续转向。
- 体素建筑：由 `blueprint.locations[].bounds` 程序化生成，`entrances` 决定门窗位置。
- 光照：`world.gameMinute` 驱动太阳方位/高度/色温，夜间切换窗户自发光。
- 2D/3D 顶栏切换，2D 版本保留为回退。
- 3D 层纯逻辑函数（体素构建、坐标映射、太阳计算、转向）的单测。

### 非范围（明确不做）

- **物理引擎**（rapier / havok）。世界是平面，碰撞由现有导航网格负责，不需要刚体。
- **3D 寻路 / 垂直化**（楼梯、多层建筑、可跳跃）。这会把工作量翻倍，且需要改服务端领域模型。**YAGNI 掉**。
- 写实模型、骨骼动画、Mixamo 等外部角色管线。
- 服务端世界生成改动、AI 生图 prompt 改动（见 §8）。
- 音效、天气、多人。

---

## 3. 架构决策

### 3.1 引擎：Three.js + react-three-fiber

选 `three` + `@react-three/fiber`（v9.7）+ `@react-three/drei`。

**为什么不是 Babylon.js**：Babylon 相对 R3F 的三个优势在本方案里全部失效 ——

| Babylon 优势 | 本方案是否需要 |
|---|---|
| AnimationGroup 骨骼动画 | 不需要。体素角色四肢是 group 旋转，程序化实现比骨骼更简单 |
| Havok 物理 | 不需要。世界平面，无刚体 |
| 内置 3D GUI | 不需要。气泡/名牌用 DOM 更合适（见 §6.5） |

剩下的都是减分项：包体积更大；与 React 生命周期耦合别扭（整个 app 是 React 19 + zustand）；体素实例化用 `InstancedMesh` 比 SolidParticleSystem 顺手；R3F 生态示例与训练语料量大得多，AI 辅助开发摩擦小。

**兼容性已验证**：`@react-three/fiber@9.7.0` 的 peer 要求为 `react >=19 <19.3`，本项目 `react@19.1.1` 满足。

**为什么不是"Phaser 里做伪 3D"**：Phaser 3/4 无 3D 能力；且现有地图已是 3/4 俯视（建筑同时有屋顶与立面），继续伪 3D 收益小，还会写成自造引擎。

**已排除**：Godot / Unity Web 导出（wasm 体积、破坏 React 集成、仓库不可读）；PlayCanvas（编辑器驱动流程与代码优先的 monorepo 冲突）。

### 3.2 三条不变量

1. **服务端一行不改。** 世界模型仍是 900×620 平面 + tile 20。相机能 360° 转，不代表寻路要 3D 化。M1–M9 的 127 个测试全部保留。
2. **2D 版本留作回退。** 渲染器契约极小（见 §5），3D 层做成 `Town3DCanvas` 与 `TownCanvas` 并列，顶栏切换。
3. **AI 生图管线不废弃。** 改为 2D 小地图用途（见 §8）。

---

## 4. 模块结构

```
apps/web/src/game3d/
  Town3DCanvas.tsx          入口：props + zustand 订阅 + gameEvents 桥接
  rendererPreference.ts     渲染器选择 + localStorage 持久化
  scene/
    TownScene3D.tsx         场景装配、相机、渲染器参数
    GroundMesh.tsx          地面 / 河流水面 / 道路
    groundPlan.ts           ★ blueprint → quad 列表
    Buildings.tsx           blueprint.bounds → 体素建筑
    buildingPlan.ts         ★ blueprint → 建筑体块
    WalkableGrid.tsx        可走范围叠加层
    walkablePlan.ts         ★ blueprint → 可走格中心
    Sun.tsx                 gameMinute → 方向光 / 环境光 / 阴影
    sunFromGameMinute.ts    ★ 纯函数
  actors/
    VoxelActor.tsx          体素演员渲染（InstancedMesh）
    Actors.tsx              订阅 store，渲染玩家 + 全部居民
    useActorPath.ts         路径回放 / 转向 / 走路相位
    pathPlayback.ts         ★ 路径续接与时长
  voxel/
    voxelTypes.ts           Voxel / VoxelPart / VoxelActorSpec 类型
    voxelMath.ts            ★ darkenHex / cullInteriorVoxels
    buildVoxelActor.ts      ★ 参数化体素人体
    actorSpecs.ts           6 份角色规格（5 NPC + player）
    sceneCoords.ts          ★ world(x,y) ↔ scene(x,z)
  ui/
    ActorLabels.tsx         名牌 + 对话气泡（DOM 投影）
    Minimap.tsx             2D 像素小地图
    bubbleText.ts           ★ 气泡文案截断
```

★ 为可单测纯函数（实现文件名为 `<模块>.ts`，测试文件为 `<模块>.test.ts`）。**不把 3D 逻辑写成只能靠肉眼看的形式** —— `pnpm verify` 必须保持有效，见 §10。

> 实现时把 `buildVoxelCharacter` 命名为 `buildVoxelActor`（它产出的是一整个演员而不只是角色外形），并把各"纯计算"从组件里拆成独立模块：`groundPlan` / `buildingPlan` / `walkablePlan` / `voxelMath` / `pathPlayback` / `bubbleText`。

---

## 5. 数据流与契约

**契约完全不变**，这是本方案能保证 2D 回退可用的根本原因。

| 方向 | 内容 | 现有位置 |
|---|---|---|
| 入（props） | `worldId` / `blueprint` / `mapImageUrl` / `npcSprites` | `TownCanvas.tsx:7-12` |
| 入（store） | `npcs` / `player` / `playerPath` 订阅 | `TownCanvas.tsx:34-42` |
| 出（事件） | `map:move {x,y}`、`npc:selected {npcId}` | `TownScene.ts:113-116` |
| 入（事件） | `npc:speak {actorId,text}`、`walkable:visible {bool}` | `TownScene.ts:118`、`295-297` |

`WorldPage.tsx:145-152` 的两处监听、`state/world-store.ts` 全部零改动。

`npcSprites` 在 3D 下不再使用（角色是体素，不是精灵表），但**保留在 props 里**，避免为它去改 `WorldPage`。

坐标映射（`sceneCoords.ts`）：`world(x, y)` → `scene(x, 0, y)`，y 轴向上，**1 world px = 1 scene unit**，不做缩放。这样 blueprint 坐标、导航网格（tile 20）都 1:1 直接可用。

---

## 6. 视觉方案

### 6.1 角色

`buildVoxelCharacter(spec)` 生成体素数组 → **剔除内部体素**（每个保留体素至少有一个面暴露）→ 单个 `InstancedMesh`，`instanceColor` 上色，一个角色一个 draw call。四肢拆 4 个 group，走路时绕各自根节点旋转。

这是 `TownScene.ts:445-481` `createPixelAvatar()` 的直接升级：那里已经用彩色矩形拼角色，并已编码 per-NPC 配件（沈知衡的白大褂、周方的挎包、唐宇成的相机）。矩形换成体素立方，俯视拼贴换成 3D 体块。

走路：相位 `sin(t)` 驱动四肢摆动；朝向 yaw 由路径段斜率给出，**连续值**。

> **顺带的重大清理**：`TownScene.ts:14-27` 的 `WALK_FRONT_FRAMES` 和 `showWalk()` 里的 `setFlipX` 是"精灵表只有左/前/背三个朝向"逼出来的补丁（注释里记录了逐帧人工验收的辛苦）。3D 里 yaw 连续，这些补丁在 3D 层完全不需要。
>
> **但清理时机必须与 2D 回退退役同步** —— `chromaKeySheet`、`registerSpriteSheets`、`registerDynSpriteSheets` 仍是 2D 渲染器的依赖，只要回退还在就不能删。本期做法：3D 层不引用它们，**不修改 `TownScene.ts` 一行**，等回退退役时一并清理（见 §12.3）。

### 6.2 建筑

`bounds` 挤出体素墙体 + 屋顶，`entrances` 坐标开门窗洞。高度按 `kind` 分档（building 高、plaza 低、water 无）。零手工建模。

### 6.3 地面

调色板程序化铺装（`qixiPixelSpec.palette` 的 8 色：水体 / 草地 / 道路），`paths` 折线生成路面，河流单独一层做 UV 流动水面。贴图用 `NearestFilter` 保持像素感。

### 6.4 光照

`gameMinute`（1440 分钟/天）驱动：

- 太阳方位角 = `(minute / 1440) * 360 - 90`，高度角走正弦，正午最大、夜间为负。
- 色温：清晨偏暖、正午中性、黄昏橙红、夜间转冷。
- 夜间：环境光转暗蓝 + **建筑窗户 emissive 自发光**（体素点一盏灯，成本极低，效果显著）。
- 阴影：单个 `DirectionalLight` + shadow map，shadow camera 限制在视口附近控制开销。

这是 3D 化最大的红利 —— 2D 里"从午后到夜晚"只能靠文字，3D 里是看得见的。

### 6.5 标签与气泡

**用 DOM 投影，不用 SDF 文字。** 具体理由：`drei` 的 `<Text>` 走字体图集，中文会撑出巨大的贴图；DOM 反而能直接复用现有气泡样式。

`ActorLabels.tsx` 把世界坐标投影到屏幕坐标，用 React 渲染名牌与气泡，复用 `WorldPage` 现有的气泡视觉。演员数量 ≤ 7，DOM 开销可接受。

---

## 7. 体素角色规格

`voxelSpecs.ts` 每个 NPC 一份规格：

```ts
interface VoxelActorSpec {
  id: string;
  palette: { clothing: string; skin: string; hair: string; accent: string };
  proportions: { head: number; torso: number; legs: number; width: number; depth: number };
  accessories: Array<{ part: string; at: [number, number, number]; size: [number, number, number]; color: string }>;
}
```

默认体型按现有"头身比约 1:2 的生活模拟像素居民"（`qixiPixelStyle.characterLanguage`）定为约 24 宽 × 12 深 × 36 高体素 —— 刻意保持现有游戏化的夸张比例，而非写实比例。相机与比例是**待调参数**，见 §12。

配件沿用现有 per-NPC 语义：

| NPC | 配件 |
|---|---|
| `npc_shen_zhiheng` | 白大褂（躯干两侧白色体块） |
| `npc_zhou_fang` | 挎包 + 斜背带 |
| `npc_tang_yucheng` | 相机（胸前小体块 + 镜片色） |
| `npc_lin_xia` / `npc_he_jianguo` | 仅调色板与体型区分 |

---

## 8. AI 生图管线的处置

**不废弃、不改 prompt，改为 2D 小地图用途。**

理由：Seedream 那张全图自身烘焙了阴影与透视，当 3D 地面会与体素建筑打架；但作为 UI 角落的像素小地图它完美，而且"3D 主视图 + 像素小地图"是标准游戏配置，面试讲解时是加分项。

收益：**M7 的 AI 生图链路、`MapAssetManifest`、视觉审查一行代码都不用动**，3D 地面走程序化，服务端零风险。

以后若要做"AI 生成地面贴图"，再加一个 job kind，不在本期范围。

---

## 9. 分期与验收

任何一期停下来都是可演示状态。

| 期 | 内容 | 结束时可演示 |
|---|---|---|
| **P0 骨架** | 依赖、`Town3DCanvas`、store/事件桥接、程序化地面、斜视 `OrbitControls`、raycast 点地移动、顶栏 2D/3D 切换（**默认 2D**） | 3D 可玩，只差角色 |
| **P1 体素角色** | `buildVoxelCharacter` + 6 份 spec + 程序化走路/转向 + 名牌气泡 | **视觉主体成立，可对外演示** |
| **P2 建筑与光照** | 体素建筑（含开门窗）+ `gameMinute` 太阳阴影 + 河流 + 行走区域叠加 | 世界完整 |
| **P3 打磨与切换** | 2D 小地图、**切换默认值翻转为 3D** + localStorage 记忆、分包懒加载、单测补齐、性能 | 交付态 |

**总验收**：

- 3D 下与 2D 功能对等：选人、对话、移动、暂停、跳过、分支、行走区域高亮。
- `pnpm verify` 全绿（lint + typecheck + test + build）。
- 2D 回退随时可用。
- **每期结束必须在真实浏览器里实测**（`pnpm verify` 只保证代码正确，不保证画面对）—— 这是项目既有规范。

---

## 10. 测试策略

现有测试全是逻辑测试（如 `game/SpeechEvents.test.ts`），3D 化后不能让验证退化成一堆查不动的 WebGL 代码。因此把可判定逻辑抽成纯函数并单测：

| 函数 | 断言 |
|---|---|
| `buildVoxelActor` | 体素数 > 0；无内部体素（每个体素至少一面暴露）；颜色全部来自 spec；配件开关生效 |
| `voxelMath` | `darkenHex` 通道压暗与边界；`cullInteriorVoxels` 3×3×3 → 26、2×2×2 → 8 |
| `sunFromGameMinute` | 正午高度角最大；午夜为负（夜间分支）；黄昏色温偏暖、夜间偏蓝 |
| `groundPlan` / `buildingPlan` / `walkablePlan` | 由 qixiBlueprint 推出的 quad / 体块 / 可走格数量与坐标；水面与建筑被正确排除 |
| `pathPlayback` | `resumePath` 的近/远/空三种分支；`segmentDurationMs` 的下限/上限/线性 |
| `bubbleText` | 72 字上限、恰好等长不截断、超长带省略号 |
| `sceneCoords` | world↔scene 往返一致；边界值 |
| `yawFromSegment` | 四个正方向 + 斜向 |

`VoxelActor` / `Actors` / `Town3DCanvas` / `Sun` / `Buildings` / `WalkableGrid` 属于渲染胶水，靠浏览器实测覆盖，不强行单测。

**逐帧动画的实现约束**：R3F 里逐帧变化的值**必须直接写到场景对象上**（`useFrame` 内改 `group.position` / `group.rotation`，或经 ref 传递），不能当作 JSX prop 传入 —— JSX prop 只在组件重渲染时生效，而逐帧动画不触发重渲染。位置的"只对齐一次"初始化与逐帧接管必须分开，否则每次 store 更新都会把插值位置拽回服务端值造成抖动。

**性能预算**：目标 60fps @ 1080p 集显。体素规模估算 —— 角色 6 × ~1200 + 建筑 ~8 × ~3000 ≈ 31k 体素，实例化后总 draw call 控制在 30 以内。超预算时的降级顺序：关阴影 → 降 DPR 上限 → 体素 2×2 降采样。

---

## 11. 风险与降级

| 风险 | 处置 |
|---|---|
| 体素量拖慢帧率 | 剔内部体素 + `InstancedMesh`（一角色一 draw call）；必要时远景建筑 LOD |
| 阴影开销 | shadow camera 限制在视口附近；一键关阴影降级 |
| 中文标签字体膨胀 | 用 DOM 投影，不用 SDF 图集（§6.5） |
| 首屏体积 | 两个渲染器路由级懒加载；Phaser 与 three 不会同时下载 |
| 视觉验收无法自动化 | 每期结束浏览器实测（§9） |
| 工作量大、可能中途停 | 分期设计，P1 结束即可演示（§9） |

---

## 12. 待决问题

1. **`npcSprites` prop 的长期去留**：本期保留以免动 `WorldPage`。若 2D 回退最终退役，可连同 Phaser 一起清理。

### 已决定

- **切换默认值**：P0–P2 默认 2D（不改变现有演示行为），P3 翻转默认值为 3D 并加 localStorage 记忆。用户已于 2026-09-23 确认,已实装。
- **切换开关进入 P0**：没有开关就无法在浏览器里验证 P0–P2，因此开关随 P0 一起落地，P3 只做默认值翻转与记忆。
- **相机参数与角色比例**(原待决项 1,实测值见 `docs/voxel-3d-verification.md` §三):
  - 默认相机 `[cx, 680, cz + 800]`(距目标 ≈1050、极角 ≈49.6°)。初版给的距离 553 + `MAX_DISTANCE = 640` 装不下 900×620 的地图 —— 距离不足时默认视野裁掉小镇,且缩放上限低于装下地图所需的 ~1300,全貌**在任何缩放级别下都看不到**。故同时抬高默认距离与上限。
  - 俯仰夹取 `[0.12π, 0.42π]`(21.6°–75.6°),保证相机永远在地平面之上。
  - 缩放 `[140, 1700]`;平移边界仍未做(见 §11 已知限制)。
  - 体素 `VOXEL_SIZE = 1`(= 1 world px),角色 10 宽 × 6 深 × 28 高,沿用 2D 的"头身比约 1:2"游戏化比例。
- **地面层高度与厚度**:见 §6.3 的实装值。原设计"水面下陷"因草地基座是不透明实体而无法成立(水面会被基座完全挡住);改为水面露出基座之上、做薄以确保角色走在路面上不陷入脚部体素。

### 实现偏差记录(与 §4–§7 的原文对照)

| 位置 | 原文 | 实装 | 原因 |
|---|---|---|---|
| 纯函数模块 | `buildVoxelCharacter` / `voxelSpecs` | `buildVoxelActor` / `actorSpecs`,并拆出 `voxelMath` / `groundPlan` / `buildingPlan` / `walkablePlan` / `pathPlayback` / `bubbleText` | 让可判定逻辑都能脱离 WebGL 单测(§10) |
| §7 体素调色板约束 | "颜色只能取自锁定调色板" | 角色配色取自 2D `createPixelAvatar` 表,不受 `qixiPixelStyle.palette` 约束 | 那 8 色是地图/建筑调色板,不含肤色与发色;两者互相矛盾,角色侧以"与 2D 同一个人"为准 |
| §6.5 行动文案位置 | 2D 放在角色脚下 | 3D 放在名牌下方、头顶上方 | 相机可环绕到低角度,脚下文字会被地面与建筑遮挡 |
| §6.4 夜间光照 | "环境光转暗蓝" | 暗蓝但亮度抬高到 0.6 | 实测 0.45 时地面几乎全黑,小镇与名牌看不清 |
| §4 场景装配 | 由 `Town3DCanvas` 传入 `litWindows` | 在 `TownScene3D` 内用 `useWorldMinute` 推导 | 省掉一层只为透传的 prop |
| §6.5 气泡 | — | `game3d/ui/bubbleText.ts` 与 `TownScene.ts` 的 `clipBubbleText` 刻意重复 | 守住"不改 2D 渲染器"约束,等回退退役时去重 |

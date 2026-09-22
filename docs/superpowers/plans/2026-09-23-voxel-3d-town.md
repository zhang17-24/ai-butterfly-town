# 2D → 3D 体素小镇实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给栖溪镇加一个可 360° 自由环绕的 3D 体素渲染器，与现有 2D Phaser 渲染器并存可切换，服务端与渲染器契约完全不变。

**Architecture:** 新增 `apps/web/src/game3d/` 目录与现有 `apps/web/src/game/` 并列。`WorldPage` 顶栏切换两个渲染器。所有可判定逻辑（坐标映射、体素构建、太阳角度、蓝图规划）写成**不 import three 的纯函数**并单测，渲染胶水层只负责把纯数据喂给 three。3D 层通过 `useWorldStore` 订阅状态、通过 `gameEvents` 派发 `map:move` / `npc:selected`，与 2D 层走同一套契约。

**Tech Stack:** Three.js + @react-three/fiber + @react-three/drei（React 19 + Vite + TypeScript + Vitest，均为项目现有栈）

**Spec:** `docs/superpowers/specs/2026-09-23-voxel-3d-town-design.md`

## Global Constraints

- **坐标映射**：`world(x, y)` → `scene(x, 0, y)`，y 轴向上，**1 world px = 1 scene unit**，不做缩放。blueprint 坐标与导航网格（tile 20）1:1 直接可用。
- **不改服务端**：`apps/server/**` 与 `packages/shared/**` 一行不改。禁止改动世界领域模型、API、WebSocket 信封。
- **不改 2D 渲染器**：`apps/web/src/game/**` 一行不改（`TownCanvas.tsx`、`TownScene.ts`、`event-bus.ts`、`speech-events.ts` 全部保持原样）。2D 是回退路径。
- **契约不变**（`WorldPage.tsx:145-152` 的监听与 `state/world-store.ts` 依赖它们）：
  - 入 props：`worldId?: string`、`blueprint?: WorldBlueprint`、`mapImageUrl?: string`、`npcSprites?: Record<string, string>`
  - 出事件：`map:move` detail `{ x: number; y: number }`（整数，世界坐标）、`npc:selected` detail `string`（npcId）
  - 入事件：`npc:speak` detail `{ actorId: string; text: string }`
- **纯函数不得 import three**：`vitest` 未配置 jsdom/WebGL 环境。所有 `*.test.ts` 依赖的模块必须是纯数据进、纯数据出，不得引入 `three` 或任何 DOM/WebGL 依赖。
- **颜色只用锁定调色板**：`qixiPixelSpec.palette` 的 8 色 —— `#194f59` `#2d8184` `#82c2a5` `#efe2bc` `#c79463` `#7c5141` `#d8684d` `#425b49`。角色配色沿用 `TownScene.ts:447-453` 已有的 per-NPC palette 值（那是 2D 已验证的配色，3D 保持一致）。
- **依赖固定版本**：`three@^0.186.0`、`@react-three/fiber@^9.7.0`、`@react-three/drei@^10.7.8`、devDep `@types/three@^0.186.0`。`three` 不自带类型声明，`@types/three` 必需。
- **不加物理库**：不要 rapier / havok / cannon。世界是平面，碰撞由现有导航网格负责。
- **不加 `three` 之外的渲染依赖**：不要 postprocessing / troika / 模型加载器。
- **每个 Task 结束必须**：`pnpm verify` 全绿（lint + typecheck + test + build），且渲染类 Task 必须在真实浏览器里按该 Task 的「验证」步骤逐条看过。
- **提交粒度**：每个 Task 一个 commit。

## File Structure

**新建：**

| 文件 | 职责 |
|---|---|
| `apps/web/src/game3d/voxel/sceneCoords.ts` | 世界坐标 ↔ 场景坐标映射、朝向角计算（纯） |
| `apps/web/src/game3d/voxel/sceneCoords.test.ts` | 上述单测 |
| `apps/web/src/game3d/scene/groundPlan.ts` | blueprint → 地面/水面/路面 quad 列表（纯） |
| `apps/web/src/game3d/scene/groundPlan.test.ts` | 上述单测 |
| `apps/web/src/game3d/voxel/voxelTypes.ts` | `Voxel` / `VoxelPart` / `VoxelActorSpec` 类型 |
| `apps/web/src/game3d/voxel/voxelMath.ts` | `darkenHex`、`cullInteriorVoxels`（纯） |
| `apps/web/src/game3d/voxel/voxelMath.test.ts` | 上述单测 |
| `apps/web/src/game3d/voxel/buildVoxelActor.ts` | 参数化体素人体（纯） |
| `apps/web/src/game3d/voxel/buildVoxelActor.test.ts` | 上述单测 |
| `apps/web/src/game3d/voxel/actorSpecs.ts` | 6 份角色规格（5 NPC + player） |
| `apps/web/src/game3d/actors/pathPlayback.ts` | `resumePath` 路径续接（纯） |
| `apps/web/src/game3d/actors/pathPlayback.test.ts` | 上述单测 |
| `apps/web/src/game3d/scene/sunFromGameMinute.ts` | `gameMinute` → 太阳状态（纯） |
| `apps/web/src/game3d/scene/sunFromGameMinute.test.ts` | 上述单测 |
| `apps/web/src/game3d/scene/buildingPlan.ts` | blueprint → 建筑体块（纯） |
| `apps/web/src/game3d/scene/buildingPlan.test.ts` | 上述单测 |
| `apps/web/src/game3d/scene/walkablePlan.ts` | blueprint → 可走格中心（纯） |
| `apps/web/src/game3d/scene/walkablePlan.test.ts` | 上述单测 |
| `apps/web/src/game3d/ui/bubbleText.ts` | 气泡文案截断（纯，与 2D 同规则） |
| `apps/web/src/game3d/ui/bubbleText.test.ts` | 上述单测 |
| `apps/web/src/game3d/rendererPreference.ts` | 渲染器选择 + localStorage 持久化 |
| `apps/web/src/game3d/Town3DCanvas.tsx` | 3D 渲染器入口（等价 `TownCanvas.tsx`） |
| `apps/web/src/game3d/scene/TownScene3D.tsx` | 场景装配：相机、光照、地面、建筑、行走区域 |
| `apps/web/src/game3d/scene/GroundMesh.tsx` | 地面 / 水面 / 路面 |
| `apps/web/src/game3d/scene/Buildings.tsx` | 体素建筑 |
| `apps/web/src/game3d/scene/WalkableGrid.tsx` | 可走范围叠加层 |
| `apps/web/src/game3d/scene/Sun.tsx` | `gameMinute` → 光照 |
| `apps/web/src/game3d/actors/VoxelActor.tsx` | 体素演员（`InstancedMesh`） |
| `apps/web/src/game3d/actors/useActorPath.ts` | 路径回放 / 转向 / 走路相位 |
| `apps/web/src/game3d/actors/Actors.tsx` | 订阅 store，渲染玩家 + 全部 NPC |
| `apps/web/src/game3d/ui/ActorLabels.tsx` | 名牌 + 对话气泡（DOM 投影） |

**修改：**

| 文件 | 改动 |
|---|---|
| `apps/web/package.json` | 加 4 个依赖（Task 1） |
| `apps/web/src/pages/WorldPage.tsx:269` | 顶栏加 2D/3D 切换按钮（Task 3） |
| `apps/web/src/pages/WorldPage.tsx:274` | 按当前渲染器渲染 `TownCanvas` 或 `Town3DCanvas`（Task 3） |
| `apps/web/src/styles.css` | 加 `.actor-label` / `.actor-bubble` / `.minimap` 样式（Task 8、Task 13） |
| `apps/web/src/App.tsx` | 路由级 lazy 加载（Task 14） |

**明确不改：** `apps/web/src/game/**`（2D 渲染器）、`apps/server/**`、`packages/shared/**`。

**已知的刻意重复（记录在案）**：`game3d/ui/bubbleText.ts` 与 `game/TownScene.ts:48-51` 的 `clipBubbleText` 规则相同。之所以不抽公共模块，是为了守住"不改 2D 渲染器"这条约束；等 2D 回退退役时与 `chromaKeySheet` 等一并去重。

---

## Task 1: 依赖与坐标映射

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/game3d/voxel/sceneCoords.ts`
- Test: `apps/web/src/game3d/voxel/sceneCoords.test.ts`

**Interfaces:**
- Consumes: `Position`、`WorldBlueprint` from `@ai-town/shared`
- Produces:
  - `worldToScene(position: Position): [number, number, number]`
  - `sceneToWorld(x: number, z: number): Position`
  - `worldCenter(canvas: { width: number; height: number }): [number, number, number]`
  - `yawFromSegment(from: Position, to: Position): number`

- [ ] **Step 1: 装依赖**

```bash
pnpm --filter @ai-town/web add three@^0.186.0 @react-three/fiber@^9.7.0 @react-three/drei@^10.7.8
pnpm --filter @ai-town/web add -D @types/three@^0.186.0
```

装完确认 `apps/web/package.json` 里 `three` / `@react-three/fiber` / `@react-three/drei` 在 `dependencies`，`@types/three` 在 `devDependencies`。

- [ ] **Step 2: 写失败的测试**

创建 `apps/web/src/game3d/voxel/sceneCoords.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { sceneToWorld, worldCenter, worldToScene, yawFromSegment } from "./sceneCoords";

describe("sceneCoords", () => {
  it("把世界 x/y 映射到场景 x/z 平面,y 轴向上", () => {
    expect(worldToScene({ x: 100, y: 200 })).toEqual([100, 0, 200]);
  });

  it("把场景平面坐标还原成四舍五入的整数世界坐标", () => {
    expect(sceneToWorld(100.4, 199.6)).toEqual({ x: 100, y: 200 });
    expect(sceneToWorld(518, 349)).toEqual({ x: 518, y: 349 });
  });

  it("整数坐标往返转换后不变", () => {
    const position = { x: 540, y: 300 };
    const [x, , z] = worldToScene(position);
    expect(sceneToWorld(x, z)).toEqual(position);
  });

  it("给出地图中心作为相机基准", () => {
    expect(worldCenter({ width: 900, height: 620 })).toEqual([450, 0, 310]);
  });

  it("朝向角让朝向 +z 的模型转向移动方向", () => {
    const origin = { x: 0, y: 0 };
    expect(yawFromSegment(origin, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(yawFromSegment(origin, { x: 1, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(yawFromSegment(origin, { x: 0, y: -1 })).toBeCloseTo(Math.PI);
    expect(yawFromSegment(origin, { x: -1, y: 0 })).toBeCloseTo(-Math.PI / 2);
  });

  it("重合点回退成 +z 方向而不是 NaN", () => {
    expect(yawFromSegment({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run sceneCoords`
Expected: FAIL — `Cannot find module './sceneCoords'`

- [ ] **Step 4: 写实现**

创建 `apps/web/src/game3d/voxel/sceneCoords.ts`：

```ts
import type { Position } from "@ai-town/shared";

/** 世界坐标(blueprint 像素,x 向右 / y 向下)→ 场景坐标(x 向右 / y 向上 / z 向里)。1 world px = 1 scene unit。 */
export function worldToScene(position: Position): [number, number, number] {
  return [position.x, 0, position.y];
}

/** 场景平面坐标 → 世界坐标。raycast 命中地面的点用这个还原成服务端接受的整数坐标。 */
export function sceneToWorld(x: number, z: number): Position {
  return { x: Math.round(x), y: Math.round(z) };
}

/** 地图中心,相机 target 与平移夹取的基准。 */
export function worldCenter(canvas: { width: number; height: number }): [number, number, number] {
  return [canvas.width / 2, 0, canvas.height / 2];
}

/** 移动方向 → 绕 y 轴的弧度。角色模型的朝向定义为 +z。 */
export function yawFromSegment(from: Position, to: Position): number {
  return Math.atan2(to.x - from.x, to.y - from.y);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run sceneCoords`
Expected: PASS — 6 passed

- [ ] **Step 6: 提交**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/game3d/voxel/sceneCoords.ts apps/web/src/game3d/voxel/sceneCoords.test.ts
git commit -m "feat(web): add 3D deps and world/scene coordinate mapping"
```

---

## Task 2: 地面规划

**Files:**
- Create: `apps/web/src/game3d/scene/groundPlan.ts`
- Test: `apps/web/src/game3d/scene/groundPlan.test.ts`

**Interfaces:**
- Consumes: `WorldBlueprint` from `@ai-town/shared`；Task 1 的 `yawFromSegment`
- Produces:
  - `GROUND_PALETTE: { grass: string; plaza: string; road: string; water: string }`
  - `GroundQuad = { x: number; z: number; length: number; width: number; rotationY: number; color: string; layer: "water" | "plaza" | "road" }`
  - `planGroundQuads(blueprint: WorldBlueprint): GroundQuad[]`

**约定**：quad 用「沿 z 轴为 length、沿 x 轴为 width、整体绕 y 旋转 `rotationY`」描述，渲染层直接用 `boxGeometry(width, thickness, length)` + `rotation-y={rotationY}`，不做欧拉角复合，避免旋转顺序歧义。

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/scene/groundPlan.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { GROUND_PALETTE, planGroundQuads } from "./groundPlan";

const palette = new Set(Object.values(GROUND_PALETTE));

describe("planGroundQuads", () => {
  it("把 water 地点铺成一层水面 quad", () => {
    const water = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "water");
    expect(water).toHaveLength(1);
    // 河流 bounds: x 280 width 220 / y 0 height 620 → 中心 (390, 310)
    expect(water[0]).toMatchObject({ x: 390, z: 310, width: 220, length: 620, rotationY: 0 });
  });

  it("把 plaza 地点铺成一层广场 quad", () => {
    const plaza = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "plaza");
    expect(plaza).toHaveLength(1);
    // 河岸市集广场 bounds: x 445 width 230 / y 115 height 300 → 中心 (560, 265)
    expect(plaza[0]).toMatchObject({ x: 560, z: 265, width: 230, length: 300, rotationY: 0 });
  });

  it("每条路径的每一段生成一条路面 quad", () => {
    const roads = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "road");
    // west-bank 3点→2段, east-bank 3点→2段, bridge 2点→1段, east-loop 3点→2段
    expect(roads).toHaveLength(7);
  });

  it("桥面 quad 沿 x 轴铺开,朝向为 +x", () => {
    const roads = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "road");
    // bridge: (250,285) → (535,285),宽 54
    const bridge = roads.find((quad) => quad.width === 54);
    expect(bridge).toBeDefined();
    expect(bridge!.x).toBeCloseTo(392.5);
    expect(bridge!.z).toBeCloseTo(285);
    expect(bridge!.length).toBeCloseTo(285);
    expect(bridge!.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("所有颜色都取自锁定调色板", () => {
    for (const quad of planGroundQuads(qixiBlueprint)) {
      expect(palette.has(quad.color)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run groundPlan`
Expected: FAIL — `Cannot find module './groundPlan'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/scene/groundPlan.ts`：

```ts
import type { WorldBlueprint } from "@ai-town/shared";
import { yawFromSegment } from "../voxel/sceneCoords";

/** 取自 PixelStyleSpec.palette(qixi-riverside-pixel-v1)的锁定色。 */
export const GROUND_PALETTE = {
  grass: "#82c2a5",
  plaza: "#efe2bc",
  road: "#efe2bc",
  water: "#194f59",
} as const;

export interface GroundQuad {
  x: number;
  z: number;
  /** 沿本地 z 轴的长度 */
  length: number;
  /** 沿本地 x 轴的宽度 */
  width: number;
  /** 绕 y 轴弧度,0 = 不旋转 */
  rotationY: number;
  color: string;
  layer: "water" | "plaza" | "road";
}

export function planGroundQuads(blueprint: WorldBlueprint): GroundQuad[] {
  const quads: GroundQuad[] = [];
  for (const location of blueprint.locations) {
    if (location.kind !== "water" && location.kind !== "plaza") continue;
    const layer = location.kind === "water" ? "water" : "plaza";
    quads.push({
      x: location.bounds.x + location.bounds.width / 2,
      z: location.bounds.y + location.bounds.height / 2,
      length: location.bounds.height,
      width: location.bounds.width,
      rotationY: 0,
      color: GROUND_PALETTE[layer],
      layer,
    });
  }
  for (const path of blueprint.paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const from = path.points[index];
      const to = path.points[index + 1];
      quads.push({
        x: (from.x + to.x) / 2,
        z: (from.y + to.y) / 2,
        length: Math.hypot(to.x - from.x, to.y - from.y),
        width: path.width,
        rotationY: yawFromSegment(from, to),
        color: GROUND_PALETTE.road,
        layer: "road",
      });
    }
  }
  return quads;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run groundPlan`
Expected: PASS — 5 passed

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/game3d/scene/groundPlan.ts apps/web/src/game3d/scene/groundPlan.test.ts
git commit -m "feat(web): plan voxel ground, water and road quads from blueprint"
```

---

## Task 3: 3D 场景骨架 + 顶栏切换

**Files:**
- Create: `apps/web/src/game3d/rendererPreference.ts`
- Create: `apps/web/src/game3d/scene/TownScene3D.tsx`
- Create: `apps/web/src/game3d/scene/GroundMesh.tsx`
- Create: `apps/web/src/game3d/Town3DCanvas.tsx`
- Modify: `apps/web/src/pages/WorldPage.tsx:45` (state)、`:269` (顶栏按钮)、`:274` (条件渲染)
- Modify: `apps/web/src/styles.css`（新增 `.town-canvas-3d` 容器样式；顶栏按钮直接复用已有的 `.walkable-toggle`，不需要新类）

**Interfaces:**
- Consumes: Task 1 的 `worldCenter` / `sceneToWorld`；Task 2 的 `planGroundQuads` / `GROUND_PALETTE`
- Produces:
  - `type RendererKind = "2d" | "3d"`
  - `readRendererPreference(): RendererKind`
  - `writeRendererPreference(kind: RendererKind): void`
  - `Town3DCanvas`，props 与 `TownCanvas` 完全一致，另加 `walkableVisible: boolean`

**要点**：
- `walkableVisible` 用 **prop** 传而不是事件，因为切换渲染器会重新挂载组件（事件会在重挂载时丢失，prop 不会）。2D 渲染器继续走它原有的 `walkable:visible` 事件路径 —— 那条路径不动。
- 点地移动用 raycast 命中地面 → `sceneToWorld` → 派发 `map:move`，与 2D 的 `pointer.worldX/worldY` 语义一致。
- 点击演员时通过 `event.stopPropagation()` 阻止地面处理器，等价于 2D 的 `if (currentlyOver.length > 0) return;`。

- [ ] **Step 1: 写渲染器偏好模块**

创建 `apps/web/src/game3d/rendererPreference.ts`：

```ts
export type RendererKind = "2d" | "3d";

const STORAGE_KEY = "ai-town.renderer";

/** P0–P2 默认 2D(不改变现有演示行为);P3 会翻转为 "3d"。 */
export const DEFAULT_RENDERER: RendererKind = "2d";

export function readRendererPreference(): RendererKind {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "3d" || stored === "2d" ? stored : DEFAULT_RENDERER;
  } catch {
    return DEFAULT_RENDERER;
  }
}

export function writeRendererPreference(kind: RendererKind): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // localStorage 不可用(隐私模式/被禁)时静默降级为不记忆
  }
}
```

- [ ] **Step 2: 写地面组件**

创建 `apps/web/src/game3d/scene/GroundMesh.tsx`：

```tsx
import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { GROUND_PALETTE, planGroundQuads, type GroundQuad } from "./groundPlan";
import { sceneToWorld, worldCenter } from "../voxel/sceneCoords";

/** 各层离地高度:水面下陷,路面与广场微微抬起避免与基座 z-fighting。 */
const LAYER_Y: Record<GroundQuad["layer"], number> = { water: -1.1, plaza: 0.2, road: 0.2 };
const QUAD_THICKNESS = 1.2;
const BASE_THICKNESS = 6;

export function GroundMesh({ blueprint, onGroundClick }: {
  blueprint: WorldBlueprint;
  onGroundClick: (world: { x: number; y: number }) => void;
}) {
  const quads = useMemo(() => planGroundQuads(blueprint), [blueprint]);
  const [cx, , cz] = worldCenter(blueprint.canvas);
  const { width, height } = blueprint.canvas;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onGroundClick(sceneToWorld(event.point.x, event.point.z));
  };

  return (
    <group>
      <mesh position={[cx, -BASE_THICKNESS / 2, cz]} receiveShadow onClick={handleClick}>
        <boxGeometry args={[width, BASE_THICKNESS, height]} />
        <meshLambertMaterial color={GROUND_PALETTE.grass} />
      </mesh>
      {quads.map((quad, index) => (
        <mesh
          key={`${quad.layer}-${index}`}
          position={[quad.x, LAYER_Y[quad.layer], quad.z]}
          rotation-y={quad.rotationY}
          receiveShadow
          onClick={handleClick}
        >
          <boxGeometry args={[quad.width, QUAD_THICKNESS, quad.length]} />
          <meshLambertMaterial color={quad.color} />
        </mesh>
      ))}
    </group>
  );
}
```

- [ ] **Step 3: 写场景装配**

创建 `apps/web/src/game3d/scene/TownScene3D.tsx`：

```tsx
import type { ReactNode } from "react";
import { OrbitControls } from "@react-three/drei";
import type { WorldBlueprint } from "@ai-town/shared";
import { GroundMesh } from "./GroundMesh";
import { worldCenter } from "../voxel/sceneCoords";

/** 俯仰夹取:0 = 正上方俯视,π/2 = 贴地平线。上下都留余量,既能看全小镇又不穿到地面以下。 */
const MIN_POLAR = Math.PI * 0.12;
const MAX_POLAR = Math.PI * 0.42;
const MIN_DISTANCE = 140;
const MAX_DISTANCE = 640;

export function TownScene3D({ blueprint, children, onGroundClick }: {
  blueprint: WorldBlueprint;
  children?: ReactNode;
  onGroundClick: (world: { x: number; y: number }) => void;
}) {
  const [cx, , cz] = worldCenter(blueprint.canvas);

  return (
    <>
      <ambientLight intensity={0.75} color="#cfe3d4" />
      <directionalLight position={[cx - 260, 420, cz - 200]} intensity={1.4} color="#fff5e0" />
      <OrbitControls
        makeDefault
        target={[cx, 0, cz]}
        minPolarAngle={MIN_POLAR}
        maxPolarAngle={MAX_POLAR}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        enablePan
        screenSpacePanning={false}
      />
      <GroundMesh blueprint={blueprint} onGroundClick={onGroundClick} />
      {children}
    </>
  );
}
```

> Task 3 的 `ambientLight` / `directionalLight` 是**临时固定光照**，Task 10 会整体替换成 `<Sun>`。
>
> **平移边界 P0 暂不做**：夹取 `OrbitControls.target` 需要拿 controls 实例的 ref，而类型来自 `three-stdlib`（drei 的传递依赖），在 pnpm 严格 `node_modules` 下**不能直接 import 未声明的依赖**。P0 先用俯仰夹取 + `minDistance`/`maxDistance` 把视野圈在合理范围，平移边界作为实测调参项留给 Task 15（spec §12 已把它列为待调参数）。

- [ ] **Step 4: 写 3D 渲染器入口**

创建 `apps/web/src/game3d/Town3DCanvas.tsx`：

```tsx
import { useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { gameEvents } from "../game/event-bus";
import { TownScene3D } from "./scene/TownScene3D";
import { worldCenter } from "./voxel/sceneCoords";

export interface Town3DCanvasProps {
  worldId?: string;
  blueprint?: WorldBlueprint;
  mapImageUrl?: string;
  npcSprites?: Record<string, string>;
  walkableVisible: boolean;
}

export function Town3DCanvas({ blueprint, walkableVisible }: Town3DCanvasProps) {
  const active = blueprint ?? qixiBlueprint;
  const [cx, , cz] = worldCenter(active.canvas);

  const handleGroundClick = useCallback((world: { x: number; y: number }) => {
    gameEvents.dispatchEvent(new CustomEvent("map:move", { detail: world }));
  }, []);

  return (
    <Canvas
      className="town-canvas-3d"
      dpr={[1, 1.75]}
      shadows
      camera={{ fov: 45, position: [cx, 420, cz + 360], near: 1, far: 3000 }}
    >
      <color attach="background" args={["#1d3b3f"]} />
      <TownScene3D blueprint={active} onGroundClick={handleGroundClick}>
        {/* Task 6 起在这里挂 Actors,Task 11 挂 Buildings,Task 12 挂 WalkableGrid */}
      </TownScene3D>
    </Canvas>
  );
}
```

> `walkableVisible`、`worldId`、`mapImageUrl`、`npcSprites` 在 Task 3 尚未使用。为通过 eslint 的未使用变量检查，**解构时只取当前用到的 `blueprint` 与 `walkableVisible`**，其余留在 props 类型里不取。上面代码已按此写法。
>
> `Canvas` 的 `camera` 只在首次挂载生效；换世界时靠 `<OrbitControls target>` 跟到新的地图中心（Target 变化会驱动 controls 更新）。因此这里不需要 `cameraTarget` state。

- [ ] **Step 3.5: 加画布容器样式**

`apps/web/src/styles.css`：在已有的 `.town-canvas` 规则（第 98 行）**旁边**追加 3D 画布容器样式。

**必须有这一步**：`Town3DCanvas` 的 `<Canvas className="town-canvas-3d">` 需要一个有确定尺寸的父容器，否则 R3F 的画布会塌成 0 高度，3D 视图一片空白。盒子尺寸与 2D 保持一致（同样的 `min(100%, 900px)` + `45/31`），这样切换渲染器时布局不跳动。

```css
.town-canvas-3d { width: min(100%, 900px); aspect-ratio: 45 / 31; overflow: hidden; border-radius: 14px; background: #1d3b3f; box-shadow: inset 0 0 0 1px rgba(31,65,45,.15); }
.town-canvas-3d canvas { display: block; width: 100% !important; height: 100% !important; }
```

- [ ] **Step 5: 接到 WorldPage**

`apps/web/src/pages/WorldPage.tsx` 改三处。

第 9 行后追加 import：

```tsx
import { Town3DCanvas } from "../game3d/Town3DCanvas";
import { readRendererPreference, writeRendererPreference, type RendererKind } from "../game3d/rendererPreference";
```

第 45 行 `const [walkableHigh, setWalkableHigh] = useState(false);` 之后追加：

```tsx
  const [renderer, setRenderer] = useState<RendererKind>(readRendererPreference);
```

第 269 行顶栏 `<div className="top-actions">` 内，把「行走区域」按钮后面紧跟插入切换按钮（改后的片段，`行走区域` 按钮原样保留）：

```tsx
<button
  className="walkable-toggle"
  onClick={() => { const next: RendererKind = renderer === "3d" ? "2d" : "3d"; setRenderer(next); writeRendererPreference(next); }}
>{renderer === "3d" ? "3D 视图" : "2D 视图"}</button>
```

第 274 行把

```tsx
<TownCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} />
```

替换为

```tsx
{renderer === "3d"
  ? <Town3DCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} walkableVisible={walkableHigh} />
  : <TownCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} />}
```

- [ ] **Step 6: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿（lint / typecheck / test / build 均通过）

- [ ] **Step 7: 浏览器验证**

```bash
pnpm dev
```

打开 `http://localhost:3200`，用 `demo` / `town1234` 登录，进入世界页，**逐条确认**：

1. 默认是 2D 视图，与改动前完全一致（点地移动、点居民、气泡、暂停按钮都正常）。
2. 顶栏出现 `2D 视图` 按钮，点击后切到 3D：看到一块 900×620 的草地色地面，中间一条深青色河流，米色路面与桥面，以及一处米色广场。
3. 鼠标左键拖拽 → 相机环绕；滚轮 → 缩放；右键拖拽 → 平移。俯仰**不会转到地面以下**（看不到地面背面）。
4. 在 3D 视图里点地面 → 地图下方提示条出现「正在规划路线…」，随后玩家位置更新（点右上角切回 2D 能看到玩家移动到了点击处附近）。
5. 点地面上的河面或建筑位置 → 服务端拒绝，提示条显示错误信息（证明 `map:move` 仍受导航网格校验）。
6. 刷新页面 → 仍然是 3D 视图（localStorage 生效）。
7. 切回 2D → 2D 场景正常渲染、可继续操作（回退可用）。

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/game3d apps/web/src/pages/WorldPage.tsx
git commit -m "feat(web): add 3D scene skeleton with orbit camera, ground and renderer toggle"
```

---

## Task 4: 体素构建纯函数

**Files:**
- Create: `apps/web/src/game3d/voxel/voxelTypes.ts`
- Create: `apps/web/src/game3d/voxel/voxelMath.ts`
- Test: `apps/web/src/game3d/voxel/voxelMath.test.ts`
- Create: `apps/web/src/game3d/voxel/buildVoxelActor.ts`
- Test: `apps/web/src/game3d/voxel/buildVoxelActor.test.ts`

**Interfaces:**
- Produces:
  - `interface Voxel { x: number; y: number; z: number; color: string }`
  - `type VoxelPartName = "head" | "torso" | "armLeft" | "armRight" | "legLeft" | "legRight"`
  - `interface VoxelPart { name: VoxelPartName; pivot: [number, number, number]; voxels: Voxel[] }`
  - `interface Accessory { part: VoxelPartName; at: [number, number, number]; size: [number, number, number]; color: string }`
  - `interface ActorPalette { clothing: string; skin: string; hair: string; accent: string; shoes: string }`
  - `interface ActorProportions { width: number; depth: number; headHeight: number; torsoHeight: number; legHeight: number; armHeight: number }`
  - `interface VoxelActorSpec { id: string; palette: ActorPalette; proportions: ActorProportions; accessories: Accessory[] }`
  - `interface ActorPose { swing: number }` — 逐帧动画姿态（Task 6/7 用）
  - `darkenHex(hex: string, amount: number): string`
  - `cullInteriorVoxels(voxels: Voxel[]): Voxel[]`
  - `buildVoxelActor(spec: VoxelActorSpec): VoxelPart[]`
  - `actorHeight(spec: VoxelActorSpec): number`

**体素坐标系约定**（渲染层据此换算，务必一致）：
- 原点在角色**双脚中心的地面点**，y 轴向上。
- x 方向：`-width/2 .. width/2 - 1`（`width` 为偶数）。
- z 方向：`-depth/2 .. depth/2 - 1`（`depth` 为偶数）。
- 每个 part 的 `voxels` 坐标是**相对该 part 的 `pivot`** 的偏移；渲染时 `group.position = pivot`、`voxel` 位置 = 相对偏移。这样旋转四肢就是绕 pivot 摆动，不需要额外补偿。
- `cullInteriorVoxels` 作用范围是**单个 part 内部**，不跨 part 剔除 —— 跨 part 剔除会让手臂遮住的躯干体素消失，手臂一摆就露出空洞。

- [ ] **Step 1: 写类型**

创建 `apps/web/src/game3d/voxel/voxelTypes.ts`：

```ts
export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

export type VoxelPartName = "head" | "torso" | "armLeft" | "armRight" | "legLeft" | "legRight";

export interface VoxelPart {
  name: VoxelPartName;
  /** 该 part 的旋转铰点在角色局部坐标中的位置。 */
  pivot: [number, number, number];
  /** 相对 pivot 的体素偏移。 */
  voxels: Voxel[];
}

export interface Accessory {
  part: VoxelPartName;
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}

export interface ActorPalette {
  clothing: string;
  skin: string;
  hair: string;
  accent: string;
  shoes: string;
}

export interface ActorProportions {
  width: number;
  depth: number;
  headHeight: number;
  torsoHeight: number;
  legHeight: number;
  armHeight: number;
}

export interface VoxelActorSpec {
  id: string;
  palette: ActorPalette;
  proportions: ActorProportions;
  accessories: Accessory[];
}

/**
 * 逐帧动画姿态。只放**需要每帧变化**的字段 —— 位置与朝向由 useActorPath 直接写到
 * 场景对象上(改对象属性不触发 React 重渲染),swing 通过 ref 传给 ActorBody 的 useFrame。
 */
export interface ActorPose {
  swing: number;
}
```

- [ ] **Step 2: 写失败的测试(voxelMath)**

创建 `apps/web/src/game3d/voxel/voxelMath.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { cullInteriorVoxels, darkenHex } from "./voxelMath";
import type { Voxel } from "./voxelTypes";

function solid(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Voxel[] {
  const voxels: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      for (let z = z0; z <= z1; z += 1)
        voxels.push({ x, y, z, color: "#000000" });
  return voxels;
}

describe("darkenHex", () => {
  it("按百分比压暗每个通道", () => {
    expect(darkenHex("#808080", 30)).toBe("#5a5a5a");
    expect(darkenHex("#ffffff", 50)).toBe("#808080");
    expect(darkenHex("#194f59", 0)).toBe("#194f59");
  });

  it("黑色压暗后仍是黑色,不会变成负数", () => {
    expect(darkenHex("#000000", 90)).toBe("#000000");
  });
});

describe("cullInteriorVoxels", () => {
  it("3×3×3 实心块只剩外层 26 个", () => {
    expect(cullInteriorVoxels(solid(0, 2, 0, 2, 0, 2))).toHaveLength(26);
  });

  it("2×2×2 实心块没有内部体素,一个都不剔", () => {
    expect(cullInteriorVoxels(solid(0, 1, 0, 1, 0, 1))).toHaveLength(8);
  });

  it("单个体素保留", () => {
    expect(cullInteriorVoxels(solid(0, 0, 0, 0, 0, 0))).toHaveLength(1);
  });

  it("两个相邻体素各自有暴露面,都保留", () => {
    expect(cullInteriorVoxels([{ x: 0, y: 0, z: 0, color: "#000" }, { x: 1, y: 0, z: 0, color: "#000" }])).toHaveLength(2);
  });

  it("空输入返回空数组", () => {
    expect(cullInteriorVoxels([])).toEqual([]);
  });

  it("保留体素的颜色不被改动", () => {
    const culled = cullInteriorVoxels(solid(0, 2, 0, 2, 0, 2));
    expect(culled.every((voxel) => voxel.color === "#000000")).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run voxelMath`
Expected: FAIL — `Cannot find module './voxelMath'`

- [ ] **Step 4: 写 voxelMath 实现**

创建 `apps/web/src/game3d/voxel/voxelMath.ts`：

```ts
import type { Voxel } from "./voxelTypes";

/** 按百分比压暗 hex 颜色,用于从主色推导裤腿等次级色(与 2D 的 darken(30) 同语义)。 */
export function darkenHex(hex: string, amount: number): string {
  const factor = Math.max(0, Math.min(100, amount)) / 100;
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  return `#${channels.map((channel) => Math.round(channel * (1 - factor)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 只保留至少有一个面暴露的体素。六邻域全被占的体素对渲染毫无贡献,剔掉能省一个数量级。
 * 只在单个 part 内部做,不跨 part —— 否则手臂摆开时会露出被剔掉的躯干空洞。
 */
export function cullInteriorVoxels(voxels: Voxel[]): Voxel[] {
  const occupied = new Set(voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  return voxels.filter((voxel) => !(
    occupied.has(`${voxel.x + 1},${voxel.y},${voxel.z}`)
    && occupied.has(`${voxel.x - 1},${voxel.y},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y + 1},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y - 1},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y},${voxel.z + 1}`)
    && occupied.has(`${voxel.x},${voxel.y},${voxel.z - 1}`)
  ));
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run voxelMath`
Expected: PASS — 8 passed

- [ ] **Step 6: 写失败的测试(buildVoxelActor)**

创建 `apps/web/src/game3d/voxel/buildVoxelActor.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { actorHeight, buildVoxelActor } from "./buildVoxelActor";
import type { VoxelActorSpec } from "./voxelTypes";

const spec: VoxelActorSpec = {
  id: "npc_test",
  palette: { clothing: "#d8684d", skin: "#f2bd91", hair: "#3f2722", accent: "#f6d36a", shoes: "#342f35" },
  proportions: { width: 10, depth: 6, headHeight: 8, torsoHeight: 10, legHeight: 10, armHeight: 9 },
  accessories: [],
};

describe("buildVoxelActor", () => {
  it("生成六个部件", () => {
    const names = buildVoxelActor(spec).map((part) => part.name);
    expect(names).toEqual(["head", "torso", "armLeft", "armRight", "legLeft", "legRight"]);
  });

  it("每个部件都非空且没有内部体素", () => {
    for (const part of buildVoxelActor(spec)) {
      expect(part.voxels.length).toBeGreaterThan(0);
      const keys = new Set(part.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
      for (const voxel of part.voxels) {
        const neighbours = [
          `${voxel.x + 1},${voxel.y},${voxel.z}`, `${voxel.x - 1},${voxel.y},${voxel.z}`,
          `${voxel.x},${voxel.y + 1},${voxel.z}`, `${voxel.x},${voxel.y - 1},${voxel.z}`,
          `${voxel.x},${voxel.y},${voxel.z + 1}`, `${voxel.x},${voxel.y},${voxel.z - 1}`,
        ];
        expect(neighbours.every((key) => keys.has(key))).toBe(false);
      }
    }
  });

  it("头在躯干之上,腿在躯干之下,顺序不重叠", () => {
    const parts = buildVoxelActor(spec);
    const top = (name: string) => {
      const part = parts.find((item) => item.name === name)!;
      return part.pivot[1] + Math.max(...part.voxels.map((voxel) => voxel.y));
    };
    const bottom = (name: string) => {
      const part = parts.find((item) => item.name === name)!;
      return part.pivot[1] + Math.min(...part.voxels.map((voxel) => voxel.y));
    };
    expect(bottom("head")).toBeGreaterThan(top("torso"));
    expect(bottom("torso")).toBeGreaterThan(top("legLeft"));
    expect(top("legRight")).toBeLessThan(bottom("torso"));
  });

  it("双腿左右分居 x 轴两侧且中间留缝", () => {
    const parts = buildVoxelActor(spec);
    const left = parts.find((part) => part.name === "legLeft")!;
    const right = parts.find((part) => part.name === "legRight")!;
    const maxX = (part: typeof left) => Math.max(...part.voxels.map((voxel) => voxel.x)) + part.pivot[0];
    const minX = (part: typeof left) => Math.min(...part.voxels.map((voxel) => voxel.x)) + part.pivot[0];
    expect(maxX(left)).toBeLessThan(minX(right));
  });

  it("四肢的铰点落在肩部与髋部,便于绕其摆动", () => {
    const parts = buildVoxelActor(spec);
    const shoulderY = spec.proportions.legHeight + spec.proportions.torsoHeight - 1;
    const hipY = spec.proportions.legHeight - 1;
    for (const name of ["armLeft", "armRight"] as const) {
      expect(parts.find((item) => item.name === name)!.pivot[1]).toBe(shoulderY);
    }
    for (const name of ["legLeft", "legRight"] as const) {
      expect(parts.find((item) => item.name === name)!.pivot[1]).toBe(hipY);
    }
  });

  it("四肢体素是相对各自铰点的偏移(铰点处为 0)", () => {
    const parts = buildVoxelActor(spec);
    for (const name of ["armLeft", "armRight", "legLeft", "legRight"] as const) {
      const part = parts.find((item) => item.name === name)!;
      // 铰点一定是该部件体素的最高处(肩膀/髋在顶端,肢体向下延伸)
      expect(Math.max(...part.voxels.map((voxel) => voxel.y))).toBe(0);
    }
  });

  it("颜色只用调色板里的值", () => {
    const allowed = new Set(Object.values(spec.palette));
    for (const part of buildVoxelActor(spec)) {
      for (const voxel of part.voxels) {
        expect(allowed.has(voxel.color) || voxel.color === "#342f35").toBe(true);
      }
    }
  });

  it("配件被附加到指定部件上", () => {
    const withAccessory = buildVoxelActor({
      ...spec,
      accessories: [{ part: "torso", at: [0, 2, -4], size: [6, 4, 1], color: "#f6d36a" }],
    });
    const torso = withAccessory.find((part) => part.name === "torso")!;
    expect(torso.voxels.some((voxel) => voxel.color === "#f6d36a")).toBe(true);
    const plain = buildVoxelActor(spec).find((part) => part.name === "torso")!;
    expect(plain.voxels.some((voxel) => voxel.color === "#f6d36a")).toBe(false);
  });

  it("身高等于腿 + 躯干 + 头", () => {
    expect(actorHeight(spec)).toBe(10 + 10 + 8);
  });
});
```

- [ ] **Step 7: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run buildVoxelActor`
Expected: FAIL — `Cannot find module './buildVoxelActor'`

- [ ] **Step 8: 写 buildVoxelActor 实现**

创建 `apps/web/src/game3d/voxel/buildVoxelActor.ts`：

```ts
import { cullInteriorVoxels, darkenHex } from "./voxelMath";
import type { Accessory, Voxel, VoxelActorSpec, VoxelPart, VoxelPartName } from "./voxelTypes";

/** 含边界的体素盒填充。 */
function fillBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): Voxel[] {
  const voxels: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      for (let z = z0; z <= z1; z += 1)
        voxels.push({ x, y, z, color });
  return voxels;
}

/** 把配件的 at/size 展开成体素。size 各分量是体素数,不是终止坐标。 */
function accessoryVoxels(accessory: Accessory): Voxel[] {
  const [x, y, z] = accessory.at;
  const [width, height, depth] = accessory.size;
  return fillBox(x, x + width - 1, y, y + height - 1, z, z + depth - 1, accessory.color);
}

const PART_ORDER: VoxelPartName[] = ["head", "torso", "armLeft", "armRight", "legLeft", "legRight"];

/** 角色总身高(体素数),标签与气泡据此定位。 */
export function actorHeight(spec: VoxelActorSpec): number {
  return spec.proportions.legHeight + spec.proportions.torsoHeight + spec.proportions.headHeight;
}

/**
 * 参数化体素人体。模型朝向 +z,原点在双脚中心的地面点,y 轴向上。
 * 造型沿用 2D createPixelAvatar 的宽腿、大头身比(约 1:2)游戏化比例,而非写实比例。
 */
export function buildVoxelActor(spec: VoxelActorSpec): VoxelPart[] {
  const { width, depth, headHeight, torsoHeight, legHeight, armHeight } = spec.proportions;
  const { clothing, skin, hair, accent, shoes } = spec.palette;
  const legColor = darkenHex(clothing, 30);

  const half = width / 2;
  const depthHalf = depth / 2;
  const x0 = -half;
  const x1 = half - 1;
  const z0 = -depthHalf;
  const z1 = depthHalf - 1;

  const legTop = legHeight - 1;
  const torsoBottom = legHeight;
  const torsoTop = legHeight + torsoHeight - 1;
  const headBottom = torsoTop + 1;
  const shoulderY = torsoTop;
  const armBottom = shoulderY - armHeight + 1;
  const legWidth = half - 1;

  const parts: VoxelPart[] = [];

  // 头:主体肤色 + 头顶 2 层与后脑 1 层的头发
  {
    const pivot: [number, number, number] = [0, headBottom, 0];
    let voxels = fillBox(x0, x1, headBottom, headBottom + headHeight - 1, z0, z1, skin);
    voxels = voxels.map((voxel) => (voxel.y >= headBottom + headHeight - 2 || voxel.z === z0 ? { ...voxel, color: hair } : voxel));
    parts.push({ name: "head", pivot, voxels: localize(voxels, pivot) });
  }

  // 躯干:主体衣色 + 胸前一条竖向 accent
  {
    const pivot: [number, number, number] = [0, torsoBottom, 0];
    const voxels = fillBox(x0, x1, torsoBottom, torsoTop, z0, z1, clothing)
      .map((voxel) => (voxel.x === 0 && voxel.z === z1 && voxel.y <= torsoBottom + 5 ? { ...voxel, color: accent } : voxel));
    parts.push({ name: "torso", pivot, voxels: localize(voxels, pivot) });
  }

  // 双臂:在躯干两侧各 2 格宽,肤色;铰点取在肩部(= 躯干顶端那一层),肢体向下延伸
  for (const [name, armX0] of [["armLeft", x0 - 2], ["armRight", x1 + 1]] as const) {
    const pivot: [number, number, number] = [armX0 + 1, shoulderY, 0];
    const voxels = fillBox(armX0, armX0 + 1, armBottom, shoulderY, z0, z1, skin);
    parts.push({ name, pivot, voxels: localize(voxels, pivot) });
  }

  // 双腿:各宽 legWidth,中间留缝;最底一层是鞋色;铰点取在腿顶端(= 髋部那一层)
  for (const [name, legX0] of [["legLeft", x0], ["legRight", x1 - legWidth + 1]] as const) {
    const pivot: [number, number, number] = [legX0 + Math.floor(legWidth / 2), legTop, 0];
    const voxels = fillBox(legX0, legX0 + legWidth - 1, 0, legTop, z0, z1, legColor)
      .map((voxel) => (voxel.y === 0 ? { ...voxel, color: shoes } : voxel));
    parts.push({ name, voxels: localize(voxels, pivot), pivot });
  }

  for (const accessory of spec.accessories) {
    const part = parts.find((item) => item.name === accessory.part);
    if (!part) continue;
    const absolute = accessoryVoxels(accessory);
    part.voxels = cullInteriorVoxels([...part.voxels, ...localize(absolute, part.pivot)]);
  }

  for (const part of parts) part.voxels = cullInteriorVoxels(part.voxels);

  return PART_ORDER.map((name) => parts.find((part) => part.name === name)!);
}

/** 把角色局部坐标的体素换算成相对 pivot 的偏移。 */
function localize(voxels: Voxel[], pivot: [number, number, number]): Voxel[] {
  return voxels.map((voxel) => ({ ...voxel, x: voxel.x - pivot[0], y: voxel.y - pivot[1], z: voxel.z - pivot[2] }));
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run buildVoxelActor`
Expected: PASS — 9 passed

> 如果「四肢体素是相对各自铰点的偏移」这条失败，检查两处：手臂铰点 y = `shoulderY`（= 躯干顶端那一层 `torsoTop`），腿铰点 y = `legTop`（= 腿顶端那一层）。两条肢体的体素最高处都必须落在铰点上，`localize` 之后最大相对 y 才会是 0。

- [ ] **Step 10: 提交**

```bash
git add apps/web/src/game3d/voxel
git commit -m "feat(web): add parametric voxel actor builder with interior culling"
```

---

## Task 5: 六份角色规格

**Files:**
- Create: `apps/web/src/game3d/voxel/actorSpecs.ts`

**Interfaces:**
- Consumes: Task 4 的 `VoxelActorSpec`
- Produces: `ACTOR_SPECS: Record<string, VoxelActorSpec>`，键为 `npc_lin_xia` / `npc_shen_zhiheng` / `npc_he_jianguo` / `npc_zhou_fang` / `npc_tang_yucheng` / `player`；以及 `fallbackSpec(id: string, color: string): VoxelActorSpec`

**配色来源**：`TownScene.ts:447-453` 的 per-NPC palette（2D 已验证过的配色，3D 原样沿用）；衣色用 `NpcProfile.color` 之外的固定值以便与 2D 一致。

- [ ] **Step 1: 写规格**

创建 `apps/web/src/game3d/voxel/actorSpecs.ts`：

```ts
import type { ActorProportions, VoxelActorSpec } from "./voxelTypes";

/** 默认体型:沿用 2D「头身比约 1:2 的生活模拟像素居民」的游戏化比例,总高 28 体素。 */
const DEFAULT_PROPORTIONS: ActorProportions = {
  width: 10,
  depth: 6,
  headHeight: 8,
  torsoHeight: 10,
  legHeight: 10,
  armHeight: 9,
};

const SHOES = "#342f35";

export const ACTOR_SPECS: Record<string, VoxelActorSpec> = {
  npc_lin_xia: {
    id: "npc_lin_xia",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#d8684d", skin: "#f2bd91", hair: "#3f2722", accent: "#f6d36a", shoes: SHOES },
    accessories: [],
  },
  npc_shen_zhiheng: {
    id: "npc_shen_zhiheng",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#2d8184", skin: "#e8b88f", hair: "#27313a", accent: "#eef6f2", shoes: SHOES },
    // 白大褂:躯干两侧各加一片白色外壳(x 在躯干外侧相邻一格)
    accessories: [
      { part: "torso", at: [-6, 10, -2], size: [1, 10, 5], color: "#eef6f2" },
      { part: "torso", at: [5, 10, -2], size: [1, 10, 5], color: "#eef6f2" },
    ],
  },
  npc_he_jianguo: {
    id: "npc_he_jianguo",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#7c5141", skin: "#dba679", hair: "#4a4742", accent: "#e3be63", shoes: SHOES },
    accessories: [],
  },
  npc_zhou_fang: {
    id: "npc_zhou_fang",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#425b49", skin: "#e7ad7e", hair: "#292b25", accent: "#e86943", shoes: SHOES },
    // 挎包:右胯外侧的小块
    accessories: [{ part: "torso", at: [5, 10, -1], size: [3, 5, 4], color: "#c85a3c" }],
  },
  npc_tang_yucheng: {
    id: "npc_tang_yucheng",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#194f59", skin: "#efb98d", hair: "#3a253f", accent: "#f0cc72", shoes: SHOES },
    // 相机:胸前一块(躯干正面 z1 = 2,z=3 是正前方一格) + 镜片色
    accessories: [
      { part: "torso", at: [-2, 15, 3], size: [4, 3, 1], color: "#3c4148" },
      { part: "torso", at: [0, 16, 4], size: [1, 1, 1], color: "#9bd2d0" },
    ],
  },
  player: {
    id: "player",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#285f83", skin: "#f2bd91", hair: "#27313a", accent: "#68d5ff", shoes: SHOES },
    accessories: [],
  },
};

/** 未知 NPC(动态生成世界)的兜底规格:用 profile.color 当衣色。 */
export function fallbackSpec(id: string, color: string): VoxelActorSpec {
  return {
    id,
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: color, skin: "#e8b184", hair: "#352a28", accent: "#f2ce72", shoes: SHOES },
    accessories: [],
  };
}

export function actorSpecFor(id: string, color: string): VoxelActorSpec {
  return ACTOR_SPECS[id] ?? fallbackSpec(id, color);
}
```

- [ ] **Step 2: 跑静态检查**

Run: `pnpm --filter @ai-town/web typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/game3d/voxel/actorSpecs.ts
git commit -m "feat(web): add per-resident voxel actor specifications"
```

---

## Task 6: 体素演员渲染

**Files:**
- Create: `apps/web/src/game3d/actors/VoxelActor.tsx`
- Create: `apps/web/src/game3d/actors/Actors.tsx`
- Modify: `apps/web/src/game3d/Town3DCanvas.tsx`（在 `TownScene3D` 内挂 `<Actors>`）

**Interfaces:**
- Consumes: Task 4 的 `VoxelPart` / `VoxelActorSpec` / `ActorPose` / `buildVoxelActor`；Task 5 的 `actorSpecFor`；Task 1 的 `worldToScene`
- Produces:
  - `VoxelPartMesh({ part }: { part: VoxelPart })` — 单个部件的 `InstancedMesh`
  - `ActorBody({ spec, poseRef }: { spec: VoxelActorSpec; poseRef: RefObject<ActorPose> })` — 一个完整角色
  - `Actors()` — 订阅 store，渲染玩家与全部居民

**渲染约定**：
- 体素尺寸 `VOXEL_SIZE = 1`（1 scene unit，与 1 world px 同尺度）。
- 用 `instancedMesh` + `setColorAt` 上色，一个部件一个 draw call。
- 演员根节点 `position = [world.x, 0, world.z]`（Task 7 接入路径后会做插值）。
- 点击演员派发 `npc:selected` 并 `stopPropagation()`，组织事件冒泡到地面（等价 2D 的 `currentlyOver` 守卫）。

- [ ] **Step 1: 写部件渲染**

创建 `apps/web/src/game3d/actors/VoxelActor.tsx`：

```tsx
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildVoxelActor } from "../voxel/buildVoxelActor";
import type { ActorPose, VoxelActorSpec, VoxelPart } from "../voxel/voxelTypes";

export const VOXEL_SIZE = 1;

const matrix = new THREE.Matrix4();
const color = new THREE.Color();

/** 单个部件:一个 InstancedMesh,每个体素一个实例。 */
export function VoxelPartMesh({ part: voxelPart }: { part: VoxelPart }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    voxelPart.voxels.forEach((voxel, index) => {
      matrix.makeTranslation(
        (voxel.x + 0.5) * VOXEL_SIZE,
        (voxel.y + 0.5) * VOXEL_SIZE,
        (voxel.z + 0.5) * VOXEL_SIZE,
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(voxel.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [voxelPart]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxelPart.voxels.length]} castShadow>
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

const LIMB_NAMES = ["armLeft", "armRight", "legLeft", "legRight"] as const;

/**
 * 一个完整角色:六个部件各自挂在自己的 pivot 组下,便于绕 pivot 摆动。
 *
 * 摆动必须在 useFrame 里**直接改 group.rotation**,不能把 swing 当 JSX prop 传 ——
 * JSX prop 只在组件重渲染时生效,而逐帧动画不会触发重渲染。
 * 因此在 Actors 层把 swing 写进 poseRef,这里每帧读出来应用到四肢 group 上。
 */
export function ActorBody({ spec, poseRef }: { spec: VoxelActorSpec; poseRef: RefObject<ActorPose> }) {
  const parts = useMemo(() => buildVoxelActor(spec), [spec]);
  const limbRefs = useRef<Record<string, THREE.Group | null>>({});

  useFrame(() => {
    const swing = poseRef.current.swing;
    for (const name of LIMB_NAMES) {
      const group = limbRefs.current[name];
      if (group) group.rotation.x = name.endsWith("Left") ? swing : -swing;
    }
  });

  return (
    <group>
      {parts.map((part) => (
        <group
          key={part.name}
          position={part.pivot}
          ref={(node) => { limbRefs.current[part.name] = node; }}
        >
          <VoxelPartMesh part={part} />
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 2: 写演员集合**

创建 `apps/web/src/game3d/actors/Actors.tsx`：

```tsx
import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { gameEvents } from "../../game/event-bus";
import { useWorldStore } from "../../state/world-store";
import { actorSpecFor } from "../voxel/actorSpecs";
import { worldToScene } from "../voxel/sceneCoords";
import type { ActorPose } from "../voxel/voxelTypes";
import { ActorBody } from "./VoxelActor";

export function Actors() {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  /** 本 Task 先固定不摆动,Task 7 接入 useActorPath 后由它逐帧写入。 */
  const poseRef = useRef<ActorPose>({ swing: 0 });

  const select = useCallback((npcId: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npcId }));
  }, []);

  return (
    <group>
      {npcs.map((npc) => {
        const [x, , z] = worldToScene(npc.state.position);
        return (
          <group key={npc.profile.id} position={[x, 0, z]} onClick={select(npc.profile.id)}>
            <ActorBody spec={actorSpecFor(npc.profile.id, npc.profile.color)} poseRef={poseRef} />
          </group>
        );
      })}
      {player && (() => {
        const [x, , z] = worldToScene(player.position);
        return (
          <group position={[x, 0, z]}>
            <ActorBody spec={actorSpecFor("player", "#285f83")} poseRef={poseRef} />
          </group>
        );
      })()}
    </group>
  );
}
```

- [ ] **Step 3: 挂进场景**

`apps/web/src/game3d/Town3DCanvas.tsx`：加 import

```tsx
import { Actors } from "./actors/Actors";
```

把 `TownScene3D` 的 children 占位注释替换为

```tsx
        <Actors />
```

- [ ] **Step 4: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 5: 浏览器验证**

```bash
pnpm dev
```

切到 3D 视图，**逐条确认**：

1. 河流两岸出现 5 个方块小人 + 1 个蓝色玩家小人，位置与 2D 视图里的人物位置一致（切回 2D 对照）。
2. 拖拽环绕相机一周 → 每个小人都能看到正/侧/背面，**任何角度都不出现纸片感或空洞**。
3. 小人脚下有阴影。
4. 点击小人 → 右侧事件面板/居民详情出现该居民（与 2D 行为一致）。
5. 点击小人**不会**触发移动（提示条不出现「正在规划路线…」）。
6. 小人身上能看到 per-NPC 特征：沈知衡两侧白色（白大褂）、周方右胯橙色块（挎包）、唐宇成胸前深色块（相机）。
7. 暂停世界 → 小人留在原地不动；点「+30分」推进 → 小人位置更新。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/game3d
git commit -m "feat(web): render residents as instanced voxel actors"
```

---

## Task 7: 路径回放与走路动画

**Files:**
- Create: `apps/web/src/game3d/actors/pathPlayback.ts`
- Test: `apps/web/src/game3d/actors/pathPlayback.test.ts`
- Create: `apps/web/src/game3d/actors/useActorPath.ts`
- Modify: `apps/web/src/game3d/actors/Actors.tsx`（用 hook 替换静态位置）

**Interfaces:**
- Consumes: Task 1 的 `yawFromSegment`；`Position` from `@ai-town/shared`
- Produces:
  - `resumePath(from: Position, path: Position[]): Position[]`
  - `WALK_SPEED_PER_UNIT: number`、`MIN_SEGMENT_MS: number`、`MAX_SEGMENT_MS: number`
  - `segmentDurationMs(from: Position, to: Position, floorMs: number, ceilMs: number): number`
  - `useActorPath({ position, path, isPlayer, rootRef, poseRef }): void` — 逐帧把位置/朝向写到 `rootRef` 的 group,把 `swing` 写进 `poseRef`

**时长沿用 2D 的既有节奏**（`TownScene.ts:246` NPC 用 `clamp(distance * 5, 110, 240)`；`:361` 玩家用 `clamp(distance * 4, 70, 180)`），保证与 tick 节奏和 2D 观感一致。

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/actors/pathPlayback.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { resumePath, segmentDurationMs } from "./pathPlayback";

describe("resumePath", () => {
  it("起点就在路径首点附近时沿用原路径", () => {
    const path = [{ x: 100, y: 100 }, { x: 120, y: 100 }];
    expect(resumePath({ x: 100, y: 100 }, path)).toBe(path);
    expect(resumePath({ x: 100.5, y: 100.5 }, path)).toBe(path);
  });

  it("当前位置远离首点时把当前位置插到最前面,避免瞬移", () => {
    const path = [{ x: 100, y: 100 }, { x: 120, y: 100 }];
    expect(resumePath({ x: 60, y: 60 }, path)).toEqual([{ x: 60, y: 60 }, { x: 100, y: 100 }, { x: 120, y: 100 }]);
  });

  it("空路径返回空数组", () => {
    expect(resumePath({ x: 1, y: 1 }, [])).toEqual([]);
  });
});

describe("segmentDurationMs", () => {
  it("近距离用下限时长", () => {
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 1, y: 0 }, 110, 240)).toBe(110);
  });

  it("远距离用上限时长", () => {
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 400, y: 0 }, 110, 240)).toBe(240);
  });

  it("中距离按时长随距离线性增长", () => {
    // 距离 40 → 40 * 5 = 200ms
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 40, y: 0 }, 110, 240)).toBe(200);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run pathPlayback`
Expected: FAIL — `Cannot find module './pathPlayback'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/actors/pathPlayback.ts`：

```ts
import type { Position } from "@ai-town/shared";

/** 与 2D 一致的每单位距离耗时(ms)。 */
export const WALK_SPEED_PER_UNIT = 5;
export const PLAYER_SPEED_PER_UNIT = 4;
export const MIN_SEGMENT_MS = 110;
export const MAX_SEGMENT_MS = 240;
export const MIN_PLAYER_SEGMENT_MS = 70;
export const MAX_PLAYER_SEGMENT_MS = 180;

/** 服务端路径可能晚于角色当前渲染位置到达:从当前位置续接,避免跳到路径起点造成瞬移。 */
export function resumePath(from: Position, path: Position[]): Position[] {
  if (path.length === 0) return [];
  const [first] = path;
  const near = Math.hypot(first.x - from.x, first.y - from.y) <= 1;
  return near ? path : [from, ...path];
}

/** 与 2D 同一条时长公式:距离 × 每单位耗时,夹取到 [floorMs, ceilMs]。 */
export function segmentDurationMs(from: Position, to: Position, floorMs: number, ceilMs: number, perUnit = WALK_SPEED_PER_UNIT): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(floorMs, Math.min(ceilMs, distance * perUnit));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run pathPlayback`
Expected: PASS — 6 passed

- [ ] **Step 5: 写回放 hook**

创建 `apps/web/src/game3d/actors/useActorPath.ts`：

```ts
import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Position } from "@ai-town/shared";
import {
  MAX_PLAYER_SEGMENT_MS, MAX_SEGMENT_MS, MIN_PLAYER_SEGMENT_MS, MIN_SEGMENT_MS,
  PLAYER_SPEED_PER_UNIT, resumePath, segmentDurationMs, WALK_SPEED_PER_UNIT,
} from "./pathPlayback";
import { yawFromSegment } from "../voxel/sceneCoords";
import type { ActorPose } from "../voxel/voxelTypes";

/** 走路摆动频率(弧度/秒)与幅度(弧度)。 */
const SWING_RATE = 11;
const SWING_AMPLITUDE = 0.55;
/** 没有路径时朝服务端权威位置收敛的速率(每秒收敛比例)。 */
const CATCH_UP_RATE = 2.2;

/**
 * 沿服务端路径回放角色位移。
 *
 * **关键**:位置与朝向直接写到场景对象上(rootRef 的 group),不经过 React 状态 ——
 * 逐帧动画不会触发重渲染,把逐帧值当 JSX prop 传是无效的。swing 同样写进 poseRef,
 * 由 ActorBody 自己的 useFrame 读取后应用到四肢。
 */
export function useActorPath({ position, path, isPlayer, rootRef, poseRef }: {
  position: Position;
  path: Position[];
  isPlayer: boolean;
  rootRef: RefObject<THREE.Group | null>;
  poseRef: RefObject<ActorPose>;
}): void {
  const queue = useRef<Position[]>([]);
  const legElapsed = useRef(0);
  const key = useRef<string>("");
  const current = useRef<Position>({ x: position.x, y: position.y });
  const yaw = useRef(0);

  // 新路径到达:从当前渲染位置续接后重建队列
  const pathKey = path.length > 1 ? path.map((point) => `${point.x},${point.y}`).join("|") : "";
  useEffect(() => {
    if (pathKey === key.current) return;
    key.current = pathKey;
    queue.current = path.length > 1 ? resumePath(current.current, path) : [];
  }, [pathKey, path]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    const queueHead = queue.current[0];

    if (!queueHead) {
      // 无路径:朝服务端权威位置平滑收敛(跳过时间/刷新恢复后的位置跳变走这里)
      const dx = position.x - current.current.x;
      const dz = position.y - current.current.y;
      const distance = Math.hypot(dx, dz);
      if (distance > 1) {
        const step = distance * Math.min(1, dt * CATCH_UP_RATE);
        current.current.x += (dx / distance) * step;
        current.current.y += (dz / distance) * step;
        yaw.current = yawFromSegment(current.current, position);
        poseRef.current.swing = Math.sin((legElapsed.current += dt * SWING_RATE)) * SWING_AMPLITUDE;
      } else {
        current.current.x = position.x;
        current.current.y = position.y;
        poseRef.current.swing = 0;
      }
    } else {
      const dx = queueHead.x - current.current.x;
      const dz = queueHead.y - current.current.y;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.5) {
        current.current.x = queueHead.x;
        current.current.y = queueHead.y;
        queue.current = queue.current.slice(1);
        if (queue.current.length === 0) poseRef.current.swing = 0;
      } else {
        const duration = segmentDurationMs(
          current.current, queueHead,
          isPlayer ? MIN_PLAYER_SEGMENT_MS : MIN_SEGMENT_MS,
          isPlayer ? MAX_PLAYER_SEGMENT_MS : MAX_SEGMENT_MS,
          isPlayer ? PLAYER_SPEED_PER_UNIT : WALK_SPEED_PER_UNIT,
        );
        const step = Math.min(distance, (distance / (duration / 1000)) * dt);
        current.current.x += (dx / distance) * step;
        current.current.y += (dz / distance) * step;
        yaw.current = yawFromSegment(current.current, queueHead);
        poseRef.current.swing = Math.sin((legElapsed.current += dt * SWING_RATE)) * SWING_AMPLITUDE;
      }
    }

    const root = rootRef.current;
    if (!root) return;
    root.position.x = current.current.x;
    root.position.z = current.current.y;
    root.rotation.y = yaw.current;
  });
}
```

- [ ] **Step 6: 接到 Actors**

`apps/web/src/game3d/actors/Actors.tsx` 整体替换为：

```tsx
import { useCallback, useLayoutEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import { gameEvents } from "../../game/event-bus";
import { useWorldStore } from "../../state/world-store";
import { actorSpecFor } from "../voxel/actorSpecs";
import type { ActorPose } from "../voxel/voxelTypes";
import { ActorBody } from "./VoxelActor";
import { useActorPath } from "./useActorPath";

export function Actors() {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  const playerPath = useWorldStore((state) => state.playerPath);

  const select = useCallback((npcId: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npcId }));
  }, []);

  return (
    <group>
      {npcs.map((npc) => (
        <ActorNode
          key={npc.profile.id}
          position={npc.state.position}
          path={npc.state.actionPath ?? []}
          spec={actorSpecFor(npc.profile.id, npc.profile.color)}
          onClick={select(npc.profile.id)}
        />
      ))}
      {player && (
        <ActorNode
          position={player.position}
          path={playerPath}
          spec={actorSpecFor("player", "#285f83")}
        />
      )}
    </group>
  );
}

function ActorNode({ position, path, spec, onClick }: {
  position: { x: number; y: number };
  path: { x: number; y: number }[];
  spec: ReturnType<typeof actorSpecFor>;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const poseRef = useRef<ActorPose>({ swing: 0 });
  useActorPath({ position, path, isPlayer: !onClick, rootRef, poseRef });

  // 只对齐一次:之后位置由 useActorPath 每帧接管。
  // 不能把 position 当成 JSX prop —— 每次 store 更新都会重渲染并把插值位置拽回服务端值,造成抖动。
  useLayoutEffect(() => {
    rootRef.current?.position.set(position.x, 0, position.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={rootRef} onClick={onClick}>
      <ActorBody spec={spec} poseRef={poseRef} />
    </group>
  );
}
```

- [ ] **Step 7: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 8: 浏览器验证**

```bash
pnpm dev
```

**逐条确认**：

1. 切 3D，居民沿路面走向目的地，**四肢摆动**（手臂与腿反相）。
2. 走到目的地后四肢**停摆**（`swing` 归零），不是原地踏步。
3. 转向连续：从向右走改为向上走时，人体平滑转身，**没有 2D 那种瞬间翻面**。
4. 位置与 2D 视图对照一致（切回 2D 看同一时刻的站位）。
5. 点地面移动玩家 → 玩家沿路径行走，速度与 2D 接近，**不会瞬移**（路径续接逻辑生效）。
6. 点「+3时」跳过时间 → 居民位置跳变到新位置时没有卡死或飞走（若出现跳变，是服务端直接给了新位置、客户端缓贴，属预期）。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/game3d/actors
git commit -m "feat(web): replay server paths with procedural walk cycle and continuous yaw"
```

---

## Task 8: 名牌与对话气泡

**Files:**
- Create: `apps/web/src/game3d/ui/bubbleText.ts`
- Test: `apps/web/src/game3d/ui/bubbleText.test.ts`
- Create: `apps/web/src/game3d/ui/ActorLabels.tsx`
- Modify: `apps/web/src/game3d/actors/Actors.tsx`（挂标签、订阅 `npc:speak` 事件、维护气泡状态）
- Modify: `apps/web/src/styles.css`（加 `.actor-label` / `.actor-bubble`）

> `npc:speak` 的订阅放在 `Actors.tsx` 里，**不改 `Town3DCanvas.tsx`** —— 气泡状态天然属于演员层，放在入口组件会为了把数据传下来而多绕一层 prop。

**Interfaces:**
- Consumes: Task 4 的 `actorHeight`；Task 5 的 `actorSpecFor`；`SPEECH_PLAYER_ACTOR`、`SpeechLine` from `../../game/speech-events`
- Produces:
  - `BUBBLE_MAX_CHARS: number`
  - `clipBubbleText(text: string): string`
  - `ActorLabel({ name, action }: { name: string; action?: string })`
  - `ActorBubble({ text }: { text: string })`

**注意**：`clipBubbleText` 与 `game/TownScene.ts:48-51` 的私有实现规则相同（72 字上限），刻意重复而不抽公共模块，以守住"不改 2D 渲染器"约束。理由见 File Structure 末尾。

**2D 的一个有意偏差**：2D 把行动文案放在角色**脚下**（`TownScene.ts:196` y=+23），3D 放在名牌**下方、头顶上方**。原因：相机可以环绕到低角度，脚下的文字会被地面与建筑遮挡。

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/ui/bubbleText.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { BUBBLE_MAX_CHARS, clipBubbleText } from "./bubbleText";

describe("clipBubbleText", () => {
  it("短文本原样返回,并去掉首尾空白", () => {
    expect(clipBubbleText("  照常办,我会盯着。  ")).toBe("照常办,我会盯着。");
  });

  it("恰好等于上限时不截断", () => {
    const text = "字".repeat(BUBBLE_MAX_CHARS);
    expect(clipBubbleText(text)).toBe(text);
  });

  it("超过上限时截断并加省略号", () => {
    const text = "字".repeat(BUBBLE_MAX_CHARS + 10);
    const clipped = clipBubbleText(text);
    expect(clipped).toBe(`${"字".repeat(BUBBLE_MAX_CHARS)}…`);
    expect(clipped.length).toBe(BUBBLE_MAX_CHARS + 1);
  });

  it("空串返回空串", () => {
    expect(clipBubbleText("")).toBe("");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run bubbleText`
Expected: FAIL — `Cannot find module './bubbleText'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/ui/bubbleText.ts`：

```ts
/** 气泡最大字数:与 2D 保持同一规则,避免两个渲染器对同一句话显示不同长度。 */
export const BUBBLE_MAX_CHARS = 72;

export function clipBubbleText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > BUBBLE_MAX_CHARS ? `${trimmed.slice(0, BUBBLE_MAX_CHARS).trimEnd()}…` : trimmed;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run bubbleText`
Expected: PASS — 4 passed

- [ ] **Step 5: 写标签组件**

创建 `apps/web/src/game3d/ui/ActorLabels.tsx`：

```tsx
import { Html } from "@react-three/drei";

export function ActorLabel({ name, action, height }: { name: string; action?: string; height: number }) {
  return (
    <Html position={[0, height + 1, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
      <div className="actor-label">
        <b>{name}</b>
        {action ? <span>{action}</span> : null}
      </div>
    </Html>
  );
}

export function ActorBubble({ text, height }: { text: string; height: number }) {
  return (
    <Html position={[0, height + 5, 0]} center zIndexRange={[40, 20]} pointerEvents="none">
      <div className="actor-bubble">{text}</div>
    </Html>
  );
}
```

- [ ] **Step 6: 加样式**

`apps/web/src/styles.css` 末尾追加（视觉沿用 2D 气泡的白底 + `#2b5a44` 描边，见 `TownScene.ts:516-536`）：

```css
.actor-label { display: grid; justify-items: center; gap: 1px; padding: 3px 6px; border-radius: 6px; color: #173024; background: rgba(245,255,242,.87); font-size: 12px; line-height: 1.25; white-space: nowrap; }
.actor-label span { color: #344a3f; background: rgba(255,255,255,.8); padding: 1px 4px; border-radius: 4px; font-size: 10px; }
.actor-bubble { max-width: 200px; padding: 9px 11px; border: 2px solid #2b5a44; border-radius: 8px; color: #1f3528; background: rgba(255,255,255,.96); font-size: 12px; line-height: 1.35; text-align: center; animation: actor-bubble-in 180ms ease-out; }
@keyframes actor-bubble-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
```

- [ ] **Step 7: 把标签挂到演员上，并接入说话事件**

`apps/web/src/game3d/actors/Actors.tsx` 的 `ActorNode` 内，`<ActorBody .../>` 后追加：

```tsx
      <ActorLabel name={name} action={action} height={actorHeight(spec)} />
```

为此 `ActorNode` 的 props 增加 `name: string` 与 `action?: string`，两个调用点分别传 `npc.profile.name` / `npc.state.currentAction`，玩家传 `"你"` 与 `undefined`。同时在文件顶部加 import：

```tsx
import { ActorLabel } from "../ui/ActorLabels";
import { actorHeight } from "../voxel/buildVoxelActor";
```

气泡状态在 `Actors` 里维护，并向 `ActorNode` 传 `bubble?: string`，`ActorNode` 内再用

```tsx
      {bubble ? <ActorBubble text={bubble} height={actorHeight(spec)} /> : null}
```

渲染。`Actors` 中接事件：

```tsx
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  useEffect(() => {
    const onSpeak = (event: Event) => {
      const detail = (event as CustomEvent<SpeechLine>).detail;
      if (typeof detail?.actorId !== "string" || typeof detail?.text !== "string") return;
      const actorId = detail.actorId === SPEECH_PLAYER_ACTOR || detail.actorId === player?.id ? (player?.id ?? "player") : detail.actorId;
      setBubbles((current) => ({ ...current, [actorId]: clipBubbleText(detail.text) }));
      window.setTimeout(() => {
        setBubbles((current) => {
          const next = { ...current };
          delete next[actorId];
          return next;
        });
      }, 2600);
    };
    gameEvents.addEventListener("npc:speak", onSpeak);
    return () => gameEvents.removeEventListener("npc:speak", onSpeak);
  }, [player?.id]);
```

并把 `bubble={bubbles[npc.profile.id]}` / `bubble={bubbles[player.id]}` 传给对应 `ActorNode`。import 需要补：

```tsx
import { useEffect, useState } from "react";
import { SPEECH_PLAYER_ACTOR, type SpeechLine } from "../../game/speech-events";
import { ActorBubble } from "../ui/ActorLabels";
import { clipBubbleText } from "../ui/bubbleText";
```

- [ ] **Step 8: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 9: 浏览器验证**

切 3D，**逐条确认**：

1. 每个居民头顶有名字牌，名字下方是当前行动文案。
2. 玩家头顶显示「你」。
3. 拖拽相机到低角度 → 名牌与气泡**始终朝向屏幕**（DOM 投影的天然特性），不会被地面遮挡。
4. 点居民对话 → 玩家与居民头顶**同时**出现气泡，文本与右侧对话框一致；约 2.6 秒后淡出消失。
5. 长回复（>72 字）→ 气泡被截断带省略号，右侧面板仍是全文。
6. 切回 2D → 2D 气泡照常工作，样式与改动前一致（证明未污染 2D 路径）。

- [ ] **Step 10: 提交**

```bash
git add apps/web/src/game3d apps/web/src/styles.css
git commit -m "feat(web): add projected name labels and speech bubbles for voxel actors"
```

---

## Task 9: 世界时间 → 光照（纯函数）

**Files:**
- Create: `apps/web/src/game3d/scene/sunFromGameMinute.ts`
- Test: `apps/web/src/game3d/scene/sunFromGameMinute.test.ts`

**Interfaces:**
- Produces:
  - `DAY_LENGTH_MINUTES = 1440`
  - `interface SunState { azimuthDeg: number; elevationDeg: number; intensity: number; color: string; ambientColor: string; ambientIntensity: number; isNight: boolean }`
  - `sunFromGameMinute(gameMinute: number, dayLength?: number): SunState`

**规则**：日出 06:00、日落 18:00；高度角为正弦曲线，正午峰值 +70°，午夜 −70°；`elevationDeg < 0` 判为夜间。

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/scene/sunFromGameMinute.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { DAY_LENGTH_MINUTES, sunFromGameMinute } from "./sunFromGameMinute";

describe("sunFromGameMinute", () => {
  it("正午太阳最高且是白天", () => {
    const noon = sunFromGameMinute(12 * 60);
    expect(noon.elevationDeg).toBeCloseTo(70, 5);
    expect(noon.isNight).toBe(false);
    expect(noon.intensity).toBeCloseTo(1.6, 5);
    expect(noon.color).toBe("#fff5e0");
  });

  it("午夜太阳在地平线以下且没有直射光", () => {
    const midnight = sunFromGameMinute(0);
    expect(midnight.elevationDeg).toBeCloseTo(-70, 5);
    expect(midnight.isNight).toBe(true);
    expect(midnight.intensity).toBe(0);
    expect(midnight.color).toBe("#4a5f8a");
  });

  it("日出与日落高度角为零", () => {
    expect(sunFromGameMinute(6 * 60).elevationDeg).toBeCloseTo(0, 5);
    expect(sunFromGameMinute(18 * 60).elevationDeg).toBeCloseTo(0, 5);
  });

  it("清晨偏暖、黄昏橙红", () => {
    expect(sunFromGameMinute(7 * 60).color).toBe("#ffd0a0");
    expect(sunFromGameMinute(17 * 60 + 30).color).toBe("#ff9a5c");
  });

  it("超过一天的分钟数取模", () => {
    expect(sunFromGameMinute(DAY_LENGTH_MINUTES + 12 * 60)).toEqual(sunFromGameMinute(12 * 60));
  });

  it("负分钟数不产生 NaN", () => {
    const state = sunFromGameMinute(-30);
    expect(Number.isFinite(state.elevationDeg)).toBe(true);
    expect(Number.isFinite(state.azimuthDeg)).toBe(true);
  });

  it("方位角随一天推进扫过 360 度", () => {
    expect(sunFromGameMinute(0).azimuthDeg).toBeCloseTo(90, 5);
    expect(sunFromGameMinute(6 * 60).azimuthDeg).toBeCloseTo(180, 5);
    expect(sunFromGameMinute(18 * 60).azimuthDeg).toBeCloseTo(360, 5);
  });

  it("夜间环境光更暗更蓝", () => {
    const night = sunFromGameMinute(0);
    const day = sunFromGameMinute(12 * 60);
    expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity);
    expect(night.ambientColor).toBe("#2a3a5c");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run sunFromGameMinute`
Expected: FAIL — `Cannot find module './sunFromGameMinute'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/scene/sunFromGameMinute.ts`：

```ts
export const DAY_LENGTH_MINUTES = 1440;
/** 日出 06:00、日落 18:00。 */
const SUNRISE = 0.25;
const SUNSET = 0.75;
const MAX_ELEVATION_DEG = 70;
const SLEEPING_INTENSITY = 1.6;
const COLOR_MORNING = "#ffd0a0";
const COLOR_DAY = "#fff5e0";
const COLOR_DUSK = "#ff9a5c";
const COLOR_NIGHT = "#4a5f8a";
const AMBIENT_DAY = "#cfe3d4";
const AMBIENT_NIGHT = "#2a3a5c";

export interface SunState {
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  color: string;
  ambientColor: string;
  ambientIntensity: number;
  isNight: boolean;
}

/**
 * 世界时间 → 太阳状态。高度角为正弦曲线:日出日落为 0,正午峰值 +70°,午夜 -70°。
 * elevationDeg < 0 判为夜间(夜光由 Sun 组件补)。
 */
export function sunFromGameMinute(gameMinute: number, dayLength = DAY_LENGTH_MINUTES): SunState {
  const wrapped = ((gameMinute % dayLength) + dayLength) % dayLength;
  const t = wrapped / dayLength;
  const dayProgress = (t - SUNRISE) / (SUNSET - SUNRISE);
  const elevationDeg = Math.sin(dayProgress * Math.PI) * MAX_ELEVATION_DEG;
  const isNight = elevationDeg < 0;
  const clamp01 = Math.max(0, Math.min(1, elevationDeg / MAX_ELEVATION_DEG));

  const color = isNight
    ? COLOR_NIGHT
    : elevationDeg < 20
      ? (dayProgress < 0.5 ? COLOR_MORNING : COLOR_DUSK)
      : COLOR_DAY;

  return {
    azimuthDeg: t * 360 + 90,
    elevationDeg,
    intensity: isNight ? 0 : clamp01 * SLEEPING_INTENSITY,
    color,
    ambientColor: isNight ? AMBIENT_NIGHT : AMBIENT_DAY,
    ambientIntensity: isNight ? 0.45 : 0.7,
    isNight,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run sunFromGameMinute`
Expected: PASS — 8 passed

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/game3d/scene/sunFromGameMinute.ts apps/web/src/game3d/scene/sunFromGameMinute.test.ts
git commit -m "feat(web): derive sun elevation and colour from world clock"
```

---

## Task 10: 光照接线与夜间窗光

**Files:**
- Create: `apps/web/src/game3d/scene/Sun.tsx`
- Modify: `apps/web/src/game3d/scene/TownScene3D.tsx`（用 `<Sun>` 替换固定光照）

**Interfaces:**
- Consumes: Task 9 的 `sunFromGameMinute`；`useWorldStore`
- Produces: `Sun({ canvas }: { canvas: { width: number; height: number } })`

- [ ] **Step 1: 写 Sun 组件**

创建 `apps/web/src/game3d/scene/Sun.tsx`：

```tsx
import { useMemo } from "react";
import { useWorldStore } from "../../state/world-store";
import { sunFromGameMinute } from "./sunFromGameMinute";

const DISTANCE = 900;
const AMBIENT_DISTANCE_FACTOR = 0.5;

/** 世界时间驱动方向光:方位角决定影子方向,高度角决定强度与色温。 */
export function Sun({ canvas }: { canvas: { width: number; height: number } }) {
  const gameMinute = useWorldStore((state) => Math.floor((state.world?.gameMinute ?? 12 * 60) / 5) * 5);
  const sun = useMemo(() => sunFromGameMinute(gameMinute), [gameMinute]);

  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (Math.max(sun.elevationDeg, 3) * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * DISTANCE;
  const centerX = canvas.width / 2;
  const centerZ = canvas.height / 2;
  const position: [number, number, number] = [
    centerX + Math.cos(azimuth) * horizontal,
    Math.sin(elevation) * DISTANCE,
    centerZ + Math.sin(azimuth) * horizontal,
  ];

  const span = Math.max(canvas.width, canvas.height) * AMBIENT_DISTANCE_FACTOR;

  return (
    <>
      <ambientLight intensity={sun.ambientIntensity} color={sun.ambientColor} />
      <hemisphereLight intensity={sun.isNight ? 0.2 : 0.35} color={sun.color} groundColor="#425b49" />
      <directionalLight
        position={position}
        intensity={Math.max(sun.intensity, sun.isNight ? 0.22 : 0)}
        color={sun.isNight ? "#8fa6d8" : sun.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={DISTANCE * 2.2}
        shadow-bias={-0.0008}
      />
      <pointLight position={[centerX, 60, centerZ]} intensity={sun.isNight ? 0.35 : 0} color="#f0cc72" distance={520} />
    </>
  );
}
```

> `gameMinute` 每 5 分钟取整一次再进 `useMemo`，避免每 tick 重建光照对象。

- [ ] **Step 2: 接到场景**

`apps/web/src/game3d/scene/TownScene3D.tsx`：删掉原来写死的 `<ambientLight>` 与 `<directionalLight>` 两行，改为

```tsx
      <Sun canvas={blueprint.canvas} />
```

并加 import：

```tsx
import { Sun } from "./Sun";
```

- [ ] **Step 3: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 4: 浏览器验证**

切 3D，**逐条确认**：

1. 世界时间是白天时 → 阴影明显、颜色偏暖。
2. 点「跳过 +3时」多次把时间推到傍晚 → 光照转橙红，影子拉长并**随方位角旋转**。
3. 继续推到夜间 → 直射光消失、整体转暗蓝，居民与建筑仍有轮廓（不是全黑）。
4. 时间推进时画面亮度平滑变化，**没有闪烁**（5 分钟量化生效）。
5. 阴影边缘无明显锯齿或大面积漏光（`shadow-bias` 与正交范围合适）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/game3d/scene/Sun.tsx apps/web/src/game3d/scene/TownScene3D.tsx
git commit -m "feat(web): drive scene lighting from world clock with shadows"
```

---

## Task 11: 体素建筑

**Files:**
- Create: `apps/web/src/game3d/scene/buildingPlan.ts`
- Test: `apps/web/src/game3d/scene/buildingPlan.test.ts`
- Create: `apps/web/src/game3d/scene/Buildings.tsx`
- Modify: `apps/web/src/game3d/scene/TownScene3D.tsx`（挂 `<Buildings>`）

**Interfaces:**
- Consumes: `WorldBlueprint`、`BlueprintLocation` from `@ai-town/shared`；`GROUND_PALETTE`
- Produces:
  - `interface BuildingMass { id: string; name: string; kind: "building" | "plaza"; x: number; z: number; width: number; depth: number; height: number; doors: Array<{ x: number; z: number }> }`
  - `planBuildingMasses(blueprint: WorldBlueprint): BuildingMass[]`
  - `BUILDING_PALETTE: { wall: string; roof: string; door: string; window: string }`

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/scene/buildingPlan.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { planBuildingMasses } from "./buildingPlan";

const masses = planBuildingMasses(qixiBlueprint);
const buildings = masses.filter((mass) => mass.kind === "building");

describe("planBuildingMasses", () => {
  it("五个建筑 + 一个广场,水面被排除", () => {
    expect(buildings).toHaveLength(5);
    expect(masses.filter((mass) => mass.kind === "plaza")).toHaveLength(1);
    expect(masses.some((mass) => mass.id === "river")).toBe(false);
  });

  it("体块以地点包围盒中心定位", () => {
    // 咖啡馆 bounds: x 0 width 255 / y 0 height 235
    expect(buildings.find((mass) => mass.id === "cafe")).toMatchObject({
      x: 127.5, z: 117.5, width: 255, depth: 235,
    });
  });

  it("建筑高度落在合理区间且随占地面积增长", () => {
    for (const building of buildings) {
      expect(building.height).toBeGreaterThan(24);
      expect(building.height).toBeLessThanOrEqual(60);
    }
    const grocery = buildings.find((mass) => mass.id === "grocery")!;   // width 190
    const apartment = buildings.find((mass) => mass.id === "apartment")!; // width 325
    expect(apartment.height).toBeGreaterThan(grocery.height);
  });

  it("广场是贴地的薄板", () => {
    expect(masses.find((mass) => mass.kind === "plaza")!.height).toBe(1);
  });

  it("入口被转成门的位置,数量与 blueprint 一致", () => {
    expect(buildings.find((mass) => mass.id === "cafe")!.doors).toEqual([{ x: 238, z: 190 }]);
    expect(masses.find((mass) => mass.id === "riverside")!.doors).toEqual([{ x: 480, z: 300 }, { x: 650, z: 315 }]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run buildingPlan`
Expected: FAIL — `Cannot find module './buildingPlan'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/scene/buildingPlan.ts`：

```ts
import type { WorldBlueprint } from "@ai-town/shared";

/** 取自锁定调色板的建筑与门窗配色。 */
export const BUILDING_PALETTE = {
  wall: "#c79463",
  roof: "#7c5141",
  door: "#7c5141",
  window: "#194f59",
} as const;

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 60;
const PLAZA_HEIGHT = 1;

export interface BuildingMass {
  id: string;
  name: string;
  kind: "building" | "plaza";
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  doors: Array<{ x: number; z: number }>;
}

/**
 * 由 blueprint 地点推导建筑体块。高度由占地宽度确定性地推出,
 * 不需要 per-location 手写高度表,新生成的世界的建筑也能自动得到合理高度。
 */
export function planBuildingMasses(blueprint: WorldBlueprint): BuildingMass[] {
  return blueprint.locations
    .filter((location) => location.kind === "building" || location.kind === "plaza")
    .map((location) => ({
      id: location.id,
      name: location.name,
      kind: location.kind as "building" | "plaza",
      x: location.bounds.x + location.bounds.width / 2,
      z: location.bounds.y + location.bounds.height / 2,
      width: location.bounds.width,
      depth: location.bounds.height,
      height: location.kind === "plaza"
        ? PLAZA_HEIGHT
        : Math.min(MAX_HEIGHT, MIN_HEIGHT + location.bounds.width / 10),
      doors: location.entrances.map((entrance) => ({ x: entrance.x, z: entrance.y })),
    }));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run buildingPlan`
Expected: PASS — 5 passed

- [ ] **Step 5: 写建筑组件**

创建 `apps/web/src/game3d/scene/Buildings.tsx`：

```tsx
import { useMemo } from "react";
import * as THREE from "three";
import type { WorldBlueprint } from "@ai-town/shared";
import { BUILDING_PALETTE, planBuildingMasses, type BuildingMass } from "./buildingPlan";

const DOOR_HEIGHT = 14;
const DOOR_WIDTH = 12;
const WINDOW_SIZE = 8;
const WINDOW_SPACING = 40;

export function Buildings({ blueprint, litWindows }: { blueprint: WorldBlueprint; litWindows: boolean }) {
  const masses = useMemo(() => planBuildingMasses(blueprint), [blueprint]);
  return (
    <group>
      {masses.map((mass) => (
        mass.kind === "plaza"
          ? <Plaza key={mass.id} mass={mass} />
          : <Building key={mass.id} mass={mass} litWindows={litWindows} />
      ))}
    </group>
  );
}

function Plaza({ mass }: { mass: BuildingMass }) {
  return (
    <mesh position={[mass.x, mass.height / 2, mass.z]} receiveShadow>
      <boxGeometry args={[mass.width, mass.height, mass.depth]} />
      <meshLambertMaterial color={BUILDING_PALETTE.wall} />
    </mesh>
  );
}

function Building({ mass, litWindows }: { mass: BuildingMass; litWindows: boolean }) {
  /** 沿正 z 面(朝向相机默认方位)铺开的窗户。 */
  const windows = useMemo(() => {
    const count = Math.max(1, Math.floor(mass.width / WINDOW_SPACING));
    const step = mass.width / (count + 1);
    return Array.from({ length: count }, (_, index) => mass.x - mass.width / 2 + step * (index + 1));
  }, [mass.width, mass.x]);

  return (
    <group>
      {/* 墙体 */}
      <mesh position={[mass.x, mass.height / 2, mass.z]} castShadow receiveShadow>
        <boxGeometry args={[mass.width, mass.height, mass.depth]} />
        <meshLambertMaterial color={BUILDING_PALETTE.wall} />
      </mesh>
      {/* 屋顶:比墙体略大一圈的压顶 */}
      <mesh position={[mass.x, mass.height + 2, mass.z]} castShadow>
        <boxGeometry args={[mass.width + 8, 4, mass.depth + 8]} />
        <meshLambertMaterial color={BUILDING_PALETTE.roof} />
      </mesh>
      {/* 入口:每扇门放在 blueprint 给的 entrance 坐标上,并沿"从建筑中心指向入口"的方向外移一点。
          这样东/南/西/北四个面的入口都能落在正确的立面上(community 的入口在西侧)。 */}
      {mass.doors.map((door, index) => {
        const facing = Math.atan2(door.x - mass.x, door.z - mass.z);
        const outward = {
          x: door.x + Math.sin(facing) * 1.2,
          z: door.z + Math.cos(facing) * 1.2,
        };
        return (
          <mesh key={`door-${index}`} position={[outward.x, DOOR_HEIGHT / 2, outward.z]} rotation-y={facing}>
            <boxGeometry args={[DOOR_WIDTH, DOOR_HEIGHT, 1.2]} />
            <meshLambertMaterial color={BUILDING_PALETTE.door} />
          </mesh>
        );
      })}
      {/* 窗:夜间自发光 */}
      {windows.map((x, index) => (
        <mesh key={`window-${index}`} position={[x, mass.height * 0.62, mass.z + mass.depth / 2 + 0.6]}>
          <boxGeometry args={[WINDOW_SIZE, WINDOW_SIZE, 1.2]} />
          <meshLambertMaterial
            color={BUILDING_PALETTE.window}
            emissive={new THREE.Color(litWindows ? "#f0cc72" : "#000000")}
            emissiveIntensity={litWindows ? 1.1 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}
```

- [ ] **Step 6: 挂进场景**

`apps/web/src/game3d/scene/TownScene3D.tsx`：`GroundMesh` 之后挂

```tsx
      <Buildings blueprint={blueprint} litWindows={litWindows} />
```

`TownScene3D` 的 props 增加 `litWindows: boolean`，由 `Town3DCanvas` 侧根据 `useWorldStore` 的 `gameMinute` 判夜（`sunFromGameMinute(...).isNight`）传入。

- [ ] **Step 7: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 8: 浏览器验证**

切 3D，**逐条确认**：

1. 五个建筑从地面上立起来，位置与 2D 地图里的建筑一一对应（切回 2D 对照）。
2. 每个建筑正立面有门，门的位置与 blueprint 的 `entrances` 一致（咖啡馆的门在建筑东南角）。
3. 河岸市集广场是一块贴地米色薄板。
4. 建筑**不遮挡玩家移动路径**：点建筑与广场之间的路面，玩家能走过去（导航由服务端负责，3D 不参与碰撞）。
5. 把时间推到夜间 → 窗户亮起暖黄色。
6. 环绕相机时建筑有正常的体积感与阴影，**没有 z-fighting 闪烁**。

- [ ] **Step 9: 提交**

```bash
git add apps/web/src/game3d
git commit -m "feat(web): build voxel buildings from blueprint locations"
```

---

## Task 12: 可走范围叠加层与水面动效

**Files:**
- Create: `apps/web/src/game3d/scene/walkablePlan.ts`
- Test: `apps/web/src/game3d/scene/walkablePlan.test.ts`
- Create: `apps/web/src/game3d/scene/WalkableGrid.tsx`
- Modify: `apps/web/src/game3d/scene/GroundMesh.tsx`（水面颜色随时间微动）
- Modify: `apps/web/src/game3d/scene/TownScene3D.tsx`（挂 `<WalkableGrid>`）

**Interfaces:**
- Consumes: `createNavigationGrid` from `@ai-town/shared`；Task 2 的 `GROUND_PALETTE`
- Produces:
  - `interface WalkableCell { x: number; z: number }`
  - `planWalkableCells(blueprint: WorldBlueprint): WalkableCell[]`

- [ ] **Step 1: 写失败的测试**

创建 `apps/web/src/game3d/scene/walkablePlan.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { createNavigationGrid } from "@ai-town/shared";
import { planWalkableCells } from "./walkablePlan";

const cells = planWalkableCells(qixiBlueprint);

describe("planWalkableCells", () => {
  it("可走格数量与导航网格统计一致", () => {
    const grid = createNavigationGrid(qixiBlueprint);
    const expected = grid.walkable.flat().filter(Boolean).length;
    expect(cells).toHaveLength(expected);
  });

  it("格中心落在网格中心上", () => {
    const grid = createNavigationGrid(qixiBlueprint);
    expect(cells[0]).toEqual({ x: grid.tileSize / 2, z: grid.tileSize / 2 });
  });

  it("建筑包围盒内没有任何可走格", () => {
    const cafe = qixiBlueprint.locations.find((location) => location.id === "cafe")!;
    const inside = cells.filter((cell) => cell.x >= cafe.bounds.x && cell.x <= cafe.bounds.x + cafe.bounds.width
      && cell.z >= cafe.bounds.y && cell.z <= cafe.bounds.y + cafe.bounds.height);
    expect(inside).toEqual([]);
  });

  it("桥面在河中央是可走的(桥把水面挖通了)", () => {
    const onBridge = cells.filter((cell) => cell.z > 275 && cell.z < 295 && cell.x > 300 && cell.x < 500);
    expect(onBridge.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ai-town/web exec vitest run walkablePlan`
Expected: FAIL — `Cannot find module './walkablePlan'`

- [ ] **Step 3: 写实现**

创建 `apps/web/src/game3d/scene/walkablePlan.ts`：

```ts
import { createNavigationGrid, type WorldBlueprint } from "@ai-town/shared";

export interface WalkableCell {
  x: number;
  z: number;
}

/** 可走格中心(世界坐标 = 场景平面坐标),供 3D 叠加层做实例化渲染。 */
export function planWalkableCells(blueprint: WorldBlueprint): WalkableCell[] {
  const grid = createNavigationGrid(blueprint);
  const cells: WalkableCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (!grid.walkable[row][column]) continue;
      cells.push({
        x: column * grid.tileSize + grid.tileSize / 2,
        z: row * grid.tileSize + grid.tileSize / 2,
      });
    }
  }
  return cells;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ai-town/web exec vitest run walkablePlan`
Expected: PASS — 4 passed

- [ ] **Step 5: 写叠加层组件**

创建 `apps/web/src/game3d/scene/WalkableGrid.tsx`：

```tsx
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldBlueprint } from "@ai-town/shared";
import { planWalkableCells } from "./walkablePlan";

const CELL_Y = 1.4;
const MARKER_SIZE = 16;
const matrix = new THREE.Matrix4();

export function WalkableGrid({ blueprint, visible }: { blueprint: WorldBlueprint; visible: boolean }) {
  const cells = useMemo(() => planWalkableCells(blueprint), [blueprint]);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.x, CELL_Y, cell.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cells.length]}
      visible={visible}
      rotation-x={-Math.PI / 2}
    >
      <planeGeometry args={[MARKER_SIZE, MARKER_SIZE]} />
      <meshBasicMaterial color="#00d4ff" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
    </instancedMesh>
  );
}
```

> `rotation-x={-Math.PI / 2}` 让平面躺平。漏掉它方格会竖立成一片墙。

- [ ] **Step 6: 水面动效**

`apps/web/src/game3d/scene/groundPlan.ts`：`GROUND_PALETTE` 增加 `waterShallow: "#2d8184"`（同样取自锁定调色板）。Task 2 的调色板断言用的是 `Object.values(GROUND_PALETTE)` 的集合包含关系，加键不会让它失败。

`apps/web/src/game3d/scene/GroundMesh.tsx`：把水的 quad 换成随时间在两个锁定色之间插值的材质。

1. 顶部 import 补充：

```tsx
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
```

2. `GroundMesh` 内加：

```tsx
  const waterRef = useRef<THREE.MeshStandardMaterial>(null);
  const shallow = useMemo(() => new THREE.Color(GROUND_PALETTE.waterShallow), []);
  const deep = useMemo(() => new THREE.Color(GROUND_PALETTE.water), []);
  useFrame((state) => {
    if (!waterRef.current) return;
    const wave = (Math.sin(state.clock.elapsedTime * 0.6) + 1) / 2;
    waterRef.current.color.copy(deep).lerp(shallow, wave * 0.45);
  });
```

3. quad 渲染时按层分支材质：`layer === "water"` 用 `<meshStandardMaterial ref={waterRef} roughness={0.35} />`，其余层保持 `<meshLambertMaterial color={quad.color} />`。

> 水面刻意**不用贴图或 shader** —— 两个锁定色之间插值就够表达流动感，且不引入任何新依赖。

- [ ] **Step 7: 挂进场景**

`TownScene3D` 增加 props `walkableVisible: boolean`，在 `GroundMesh` 后挂

```tsx
      <WalkableGrid blueprint={blueprint} visible={walkableVisible} />
```

`Town3DCanvas` 把已有的 `walkableVisible` prop 透传给 `TownScene3D`。

- [ ] **Step 8: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 9: 浏览器验证**

切 3D，**逐条确认**：

1. 顶栏点「行走区域」→ 地面上浮起一层青色方格，覆盖道路、广场、桥面。
2. 青色方格**不覆盖**建筑与河面（桥面除外）。
3. 拖拽到低角度 → 方格是贴地薄片，**不是竖立的**。
4. 再点一次「行走区域」→ 叠加层消失。
5. 开着叠加层切到 2D 再切回 3D → 叠加层状态**保持开启**（`walkableVisible` prop 在重挂载时仍然生效）。
6. 河面颜色缓慢明暗呼吸，**不卡顿**。

- [ ] **Step 10: 提交**

```bash
git add apps/web/src/game3d
git commit -m "feat(web): add walkable-cell overlay and animated water surface"
```

---

## Task 13: 2D 小地图与默认值翻转

**Files:**
- Create: `apps/web/src/game3d/ui/Minimap.tsx`
- Modify: `apps/web/src/game3d/rendererPreference.ts`（`DEFAULT_RENDERER` 改为 `"3d"`）
- Modify: `apps/web/src/pages/WorldPage.tsx`（`.map-stage` 内挂小地图）
- Modify: `apps/web/src/styles.css`（`.minimap`）

**Interfaces:**
- Consumes: 现有 `mapImageUrl` prop（Seedream 生成的 900×620 全图）；`useWorldStore` 的 `npcs` / `player`
- Produces: `Minimap({ imageUrl, blueprint }: { imageUrl?: string; blueprint?: WorldBlueprint })`

**为什么小地图用那张 AI 全图**：那张图自身烘焙了阴影与透视，当 3D 地面会与体素建筑打架；但作为俯视小地图它完美，且"M7 的 AI 生图链路一行不改" 是本设计的核心不变量。

- [ ] **Step 1: 写小地图组件**

创建 `apps/web/src/game3d/ui/Minimap.tsx`：

```tsx
import { useWorldStore } from "../../state/world-store";
import type { WorldBlueprint } from "@ai-town/shared";

const FALLBACK_MAP = "/assets/maps/qixi-town-prebuilt-v1.png";

/** 3D 主视图左下角的像素小地图:复用已有的 AI 生成俯视图,并实时标出居民与玩家。 */
export function Minimap({ imageUrl, blueprint }: { imageUrl?: string; blueprint?: WorldBlueprint }) {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  const canvas = blueprint?.canvas ?? { width: 900, height: 620 };
  const present = (position?: { x: number; y: number }) => position
    ? { left: `${(position.x / canvas.width) * 100}%`, top: `${(position.y / canvas.height) * 100}%` }
    : undefined;

  return (
    <div className="minimap">
      <img src={imageUrl ?? FALLBACK_MAP} alt="栖溪镇俯视图" />
      {npcs.map((npc) => (
        <i key={npc.profile.id} className="minimap-dot npc" style={{ ...present(npc.state.position), background: npc.profile.color }} />
      ))}
      {player && <i className="minimap-dot player" style={present(player.position)} />}
      <span className="minimap-label">栖溪镇 · 俯视</span>
    </div>
  );
}
```

- [ ] **Step 2: 加样式**

`apps/web/src/styles.css` 末尾追加：

```css
.minimap { position: absolute; left: 22px; top: 22px; width: 236px; aspect-ratio: 45 / 31; overflow: hidden; border: 2px solid rgba(23,59,54,.72); border-radius: 10px; background: #173e42; box-shadow: 0 6px 18px rgba(12,32,26,.28); }
.minimap img { display: block; width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
.minimap-dot { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border: 1px solid rgba(255,255,255,.9); border-radius: 999px; }
.minimap-dot.player { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; background: #68d5ff; }
.minimap-label { position: absolute; left: 8px; bottom: 6px; padding: 2px 6px; border-radius: 5px; color: #eaf3ed; background: rgba(20,43,29,.7); font-size: 10px; }
```

- [ ] **Step 3: 翻转默认值**

`apps/web/src/game3d/rendererPreference.ts`：把

```ts
export const DEFAULT_RENDERER: RendererKind = "2d";
```

改为

```ts
export const DEFAULT_RENDERER: RendererKind = "3d";
```

并把上面那行注释从「P0–P2 默认 2D」更新为「交付默认 3D;localStorage 记住用户选择」。

- [ ] **Step 4: 挂到 WorldPage**

`apps/web/src/pages/WorldPage.tsx` 第 273-274 行的 `.map-stage` 内：把原来的 `TownCanvas` / `Town3DCanvas` 条件渲染再包一层，3D 时额外渲染小地图。

```tsx
{renderer === "3d" ? (
  <>
    <Town3DCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} walkableVisible={walkableHigh} />
    <Minimap imageUrl={mapImageUrl ?? undefined} blueprint={blueprint ?? undefined} />
  </>
) : (
  <TownCanvas worldId={worldId} blueprint={blueprint ?? undefined} mapImageUrl={mapImageUrl ?? undefined} npcSprites={npcSprites} />
)}
```

加 import：

```tsx
import { Minimap } from "../game3d/ui/Minimap";
```

- [ ] **Step 5: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 6: 浏览器验证**

**逐条确认**：

1. 清掉 localStorage（DevTools → Application → Local Storage 删 `ai-town.renderer`）后刷新 → **默认进入 3D 视图**。
2. 左上角出现小地图，显示栖溪镇俯视图，居民位置以各自配色的小点标出，玩家是青色点。
3. 推进时间/移动玩家 → 小地图上的点**跟着移动**（切回 2D 对照位置一致）。
4. 切到 2D → 小地图消失（2D 自己就是俯视图，不需要）。
5. 刷新后仍停在 2D（用户选择被记住）；再切回 3D 后刷新仍停在 3D。
6. 小地图与「注入事件」按钮不重叠，遮挡不明显。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src/game3d apps/web/src/pages/WorldPage.tsx apps/web/src/styles.css
git commit -m "feat(web): add pixel minimap and default to 3D renderer"
```

---

## Task 14: 分包懒加载与性能降级

**Files:**
- Modify: `apps/web/src/App.tsx`（`WorldPage` 路由级 lazy）
- Modify: `apps/web/src/pages/WorldPage.tsx`（两个渲染器都改成 lazy）
- Modify: `apps/web/src/game3d/Town3DCanvas.tsx`（DPR 与阴影降级开关）

**目标**：Phaser（约 1MB）与 three（约 600KB）**不同时进首屏**，且低端设备能一键降级。

- [ ] **Step 1: 把两个渲染器改成 lazy**

`apps/web/src/pages/WorldPage.tsx`：删除两行静态渲染器 import（原有的 `import { TownCanvas } from "../game/TownCanvas";` 与 Task 3 加的 `Town3DCanvas`），改为模块级 lazy 常量。

**注意不要把 `react` 重复 import 一次** —— 文件顶部已有 `import { useEffect, useState, type FormEvent } from "react";`，把需要的成员并进那一行即可：

```tsx
import { Suspense, lazy, useEffect, useState, type FormEvent } from "react";
```

然后在其下方加：

```tsx
const TownCanvas = lazy(() => import("../game/TownCanvas").then((module) => ({ default: module.TownCanvas })));
const Town3DCanvas = lazy(() => import("../game3d/Town3DCanvas").then((module) => ({ default: module.Town3DCanvas })));
```

并给第 273-274 行的条件渲染包 `<Suspense>`：

```tsx
<Suspense fallback={<div className="town-canvas" aria-busy="true" />}>
  ...原条件渲染...
</Suspense>
```

- [ ] **Step 2: WorldPage 路由级 lazy**

`apps/web/src/App.tsx`：

```tsx
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";

const WorldPage = lazy(() => import("./pages/WorldPage").then((module) => ({ default: module.WorldPage })));
const CausalPage = lazy(() => import("./pages/CausalPage").then((module) => ({ default: module.CausalPage })));
const NewWorldPage = lazy(() => import("./pages/NewWorldPage").then((module) => ({ default: module.NewWorldPage })));
const AiLabPage = lazy(() => import("./pages/AiLabPage").then((module) => ({ default: module.AiLabPage })));

export function App() {
  return (
    <Suspense fallback={<div className="loading-page">加载中…</div>}>
      <Routes>
        {/* 路由表保持原样 */}
      </Routes>
    </Suspense>
  );
}
```

路由表内容原样搬运，不要改动路径。

- [ ] **Step 3: 性能降级开关**

`apps/web/src/game3d/Town3DCanvas.tsx`：把 `react` 的 import 补上 `useMemo`（该文件在 Task 3 只 import 了 `useCallback`），然后加一个按设备能力自动降级的读取函数

```tsx
/** 低端设备(小屏 / 少核心)自动降级:关阴影、限 DPR。 */
function useQualityTier(): "full" | "lite" {
  return useMemo(() => {
    if (typeof window === "undefined") return "full";
    const cores = navigator.hardwareConcurrency ?? 4;
    const small = window.matchMedia("(max-width: 820px)").matches;
    return cores <= 4 || small ? "lite" : "full";
  }, []);
}
```

并在 `Canvas` 上应用：

```tsx
const tier = useQualityTier();
...
<Canvas
  className="town-canvas-3d"
  dpr={tier === "lite" ? [1, 1.25] : [1, 1.75]}
  shadows={tier === "full"}
  ...
```

`shadows` 为 false 时 `castShadow` / `receiveShadow` 会被 three 忽略，无需改子组件。

- [ ] **Step 4: 跑静态检查与构建**

Run: `pnpm verify`
Expected: 全绿

- [ ] **Step 5: 检查分包结果**

```bash
pnpm --filter @ai-town/web build
ls -la apps/web/dist/assets/ | sort -k5 -n -r | head -12
```

**确认**：产物里 `three` 与 `phaser` 落在**不同的** chunk（各自有独立文件名），且 `dist/index.html` 引用的入口 chunk **不含**两者。

- [ ] **Step 6: 浏览器验证**

```bash
pnpm dev
```

**逐条确认**：

1. 冷启动打开 `http://localhost:3200` → 首屏可交互；DevTools Network 面板里访问登录页时**没有**加载 three 或 phaser 的 chunk。
2. 进入世界页 → 加载所选渲染器的 chunk，随后正常渲染。
3. 切到 2D → 才加载 phaser chunk；切回 3D → three chunk 已在缓存，不重复请求。
4. 世界页切换过程中出现短暂的空白占位（Suspense fallback），不报错、不白屏。
5. 用 DevTools 缩到 375px 宽并刷新 → 进入 lite 档：阴影消失、画面仍可操作（对比桌面端帧率更好）。
6. Lighthouse 或 Performance 面板看帧率 → 桌面端 3D 视图稳定 60fps 量级（±5）。

- [ ] **Step 7: 提交**

```bash
git add apps/web/src
git commit -m "perf(web): lazy-load renderers and add device quality tiers"
```

---

## Task 15: 文档与交付验证

**Files:**
- Modify: `README.md`（工程结构、可体验内容、渲染器切换说明）
- Modify: `docs/superpowers/specs/2026-09-23-voxel-3d-town-design.md`（把「待决问题」里已定的项移到「已决定」，补实测参数）
- Create: `docs/voxel-3d-verification.md`（本次改造的验证记录）

- [ ] **Step 1: 写验证记录**

创建 `docs/voxel-3d-verification.md`，逐条记录**实际跑过**的结果。

> 模板里的 `(填)` 是待填槽位，**交付时必须全部替换成真实观测值**，不允许留任何 `(填)`。没跑过的项写「未跑」并说明原因，不要留空。

```markdown
# 体素 3D 改造验证记录

日期:(填写实际执行日期)

## 自动化

| 检查 | 命令 | 结果 |
|---|---|---|
| lint + typecheck + test + build | `pnpm verify` | (填) |
| 新增单测 | `pnpm --filter @ai-town/web test` | (填通过的用例数) |

## 浏览器实测(P0–P3 各 Task 的验证清单)

| Task | 视口 | 结果 | 备注 |
|---|---|---|---|
| 3 场景骨架 | 桌面 1440×900 | (填) | |
| 6 体素演员 | 桌面 | (填) | |
| 7 走路动画 | 桌面 | (填) | |
| 8 名牌气泡 | 桌面 | (填) | |
| 10 光照 | 桌面 | (填) | |
| 11 建筑 | 桌面 | (填) | |
| 12 叠加层与水面 | 桌面 | (填) | |
| 13 小地图与默认值 | 桌面 | (填) | |
| 14 分包与降级 | 桌面 + 375px | (填) | |

## 功能对等核对(3D vs 2D)

| 能力 | 2D | 3D |
|---|---|---|
| 点地移动 | (填) | (填) |
| 点居民选人 | (填) | (填) |
| 对话气泡 | (填) | (填) |
| 暂停 / 继续 | (填) | (填) |
| 跳过时间 | (填) | (填) |
| 创建分支 | (填) | (填) |
| 行走区域高亮 | (填) | (填) |

## 实测参数(最终值)

- 相机俯仰范围:`(填)` 到 `(填)`;缩放范围 `(填)`–`(填)`
- 体素尺寸:`(填)`;角色总高 `(填)` 体素
- 单帧 draw call 峰值:`(填)`
- 桌面帧率:`(填)`;lite 档帧率:`(填)`

## 未做 / 已知限制

- (填,例如:未做物理碰撞、不支持多层建筑等)
```

- [ ] **Step 2: 更新 README**

`README.md` 的「工程结构」段把

```text
apps/web             React + Phaser + TanStack Query + Zustand
```

改为

```text
apps/web             React + Three.js/Phaser(可切换)+ TanStack Query + Zustand
```

「当前可体验内容」段追加一条：

```markdown
- **2D / 3D 双视图**:顶栏一键切换。3D 视图是可 360° 环绕的体素小镇 —— 居民是代码生成的体素模型(不依赖外部建模工具),建筑由 Blueprint 程序化生成,光照跟随世界时间从午后走到夜晚,并带像素小地图。默认 3D,选择被本地记住。
```

- [ ] **Step 3: 回填 spec 的实测参数与新约束**

`docs/superpowers/specs/2026-09-23-voxel-3d-town-design.md`：

- §12「待决问题」第 1 条(相机参数与角色比例)按 `docs/voxel-3d-verification.md` 的实测值改写为已定值,并移到「已决定」。
- §7 的「相机与比例是待调参数」改为引用实测值。
- 新增一节记录本次实现中发现的与 spec 的偏差(例如 2D 行动文案在脚下、3D 移到头顶上方的原因已写在 spec §6.5,若实现时又出现新偏差,一并补记)。

- [ ] **Step 4: 跑最终验证**

```bash
pnpm verify && pnpm delivery:check
```

Expected: 全绿;`delivery:check` 输出人工确认清单。

- [ ] **Step 5: 提交**

```bash
git add README.md docs
git commit -m "docs: record voxel 3D implementation verification and update README"
```

---

## 收尾清单

全部 Task 完成后，对照 spec 逐项确认：

- [ ] 3D 与 2D 功能对等(见 Task 15 的对等核对表)
- [ ] `pnpm verify` 全绿
- [ ] 2D 回退可用(顶栏可切回，且 2D 行为与改造前一致)
- [ ] `apps/web/src/game/**`、`apps/server/**`、`packages/shared/**` 均未改动(`git diff --stat` 核对)
- [ ] 每个 Task 的浏览器验证清单都实测过，结果记入 `docs/voxel-3d-verification.md`
- [ ] 单测覆盖全部纯函数:sceneCoords / groundPlan / voxelMath / buildVoxelActor / pathPlayback / bubbleText / sunFromGameMinute / buildingPlan / walkablePlan

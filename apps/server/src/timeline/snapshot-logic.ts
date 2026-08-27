/**
 * M6 快照 / 跳过 / 分支恢复 —— 纯判定与编排,不触库、不碰请求对象。
 * 消费方(主线接线)负责把事件流与世界状态喂入,按返回的步骤执行推进。
 */

// 周期快照间隔:每 60 个世界分钟一个滚动快照(技术方案 §7.2)。
export const SNAPSHOT_INTERVAL_MINUTES = 60;

// 滚动快照上限,达到上限后周期快照不再自动创建(交由里程碑/存储清理处理,D66)。
export const DEFAULT_ROLLING_SNAPSHOT_CAP = 96;

// 重大事件类型:除周期外,触发快照(示例含 factory 生产线事故类)。
export const MAJOR_EVENT_TYPES = [
  "factory_fire",
  "flood",
  "emergency",
  "accident",
  "power_outage",
] as const;

// 紧急事件类型:跳过推进在此类事件前提前停止(D38)。
export const EMERGENCY_EVENT_TYPES = [
  "emergency",
  "factory_fire",
  "flood",
  "accident",
] as const;

export type SnapshotReason =
  | "major_event"
  | "periodic"
  | "initial_state"
  | "cap_reached"
  | "normal";

export interface SnapshotDecision {
  should: boolean;
  reason: SnapshotReason;
}

export interface SnapshotOptions {
  intervalMinutes?: number;
  majorEventTypes?: readonly string[];
  rollingCap?: number;
}

export function shouldSnapshot(
  version: number,
  gameMinute: number,
  eventType: string,
  snapshotCount: number,
  options?: SnapshotOptions,
): SnapshotDecision {
  const majorEventTypes = options?.majorEventTypes ?? MAJOR_EVENT_TYPES;
  if (majorEventTypes.includes(eventType)) {
    return { should: true, reason: "major_event" };
  }
  if (version <= 0 || gameMinute <= 0) {
    return { should: false, reason: "initial_state" };
  }
  const rollingCap = options?.rollingCap ?? DEFAULT_ROLLING_SNAPSHOT_CAP;
  if (snapshotCount >= rollingCap) {
    return { should: false, reason: "cap_reached" };
  }
  const interval = options?.intervalMinutes ?? SNAPSHOT_INTERVAL_MINUTES;
  if (gameMinute % interval === 0) {
    return { should: true, reason: "periodic" };
  }
  return { should: false, reason: "normal" };
}

export interface SkipEventView {
  id: string;
  gameMinute: number;
  type: string;
}

export interface SkipScheduleInput {
  gameMinute: number;
  currentActionEndsAtMinute?: number | null;
  events: SkipEventView[];
}

export interface SkipStep {
  fromMinute: number;
  toMinute: number;
  kind: "advance" | "emergency_stop" | "arrive";
  atEventId?: string;
  atEventType?: string;
  reason: string;
}

export interface SkipSchedule {
  steps: SkipStep[];
  targetMinute: number;
  plannedEndMinute: number;
  stoppedByEmergency: boolean;
  stopEventId: string | null;
}

interface PauseStop {
  minute: number;
  kind: "advance" | "emergency_stop";
  event?: SkipEventView;
}

export function buildSkipSchedule(
  world: SkipScheduleInput,
  targetMinute: number,
  options?: { emergencyEventTypes?: readonly string[] },
): SkipSchedule {
  const emergencyTypes = options?.emergencyEventTypes ?? EMERGENCY_EVENT_TYPES;

  if (targetMinute <= world.gameMinute) {
    return {
      steps: [],
      targetMinute,
      plannedEndMinute: world.gameMinute,
      stoppedByEmergency: false,
      stopEventId: null,
    };
  }

  const stops: PauseStop[] = [];
  const actionEnd = world.currentActionEndsAtMinute ?? null;
  if (actionEnd !== null && actionEnd > world.gameMinute && actionEnd <= targetMinute) {
    stops.push({ minute: actionEnd, kind: "advance" });
  }

  const upcoming = [...world.events].sort((a, b) => a.gameMinute - b.gameMinute);
  for (const event of upcoming) {
    if (event.gameMinute > targetMinute) break;
    if (event.gameMinute <= world.gameMinute) continue;
    stops.push({
      minute: event.gameMinute,
      kind: emergencyTypes.includes(event.type) ? "emergency_stop" : "advance",
      event,
    });
    if (emergencyTypes.includes(event.type)) break;
  }

  stops.sort((a, b) => a.minute - b.minute);
  const merged: PauseStop[] = [];
  for (const stop of stops) {
    const last = merged[merged.length - 1];
    if (last && last.minute === stop.minute) {
      if (stop.kind === "emergency_stop" || (last.kind === "advance" && !last.event && stop.event)) {
        merged[merged.length - 1] = stop;
      }
    } else {
      merged.push(stop);
    }
  }

  const steps: SkipStep[] = [];
  let from = world.gameMinute;
  let stoppedByEmergency = false;
  let stopEventId: string | null = null;

  for (const stop of merged) {
    if (stop.minute <= from) continue;
    const reason = stop.kind === "emergency_stop"
      ? `紧急事件(${stop.event?.type})将临,跳过推进提前停止`
      : stop.event
        ? `推进至事件(${stop.event.type})`
        : "当前动作结束,续跳";
    steps.push({
      fromMinute: from,
      toMinute: stop.minute,
      kind: stop.kind,
      atEventId: stop.event?.id,
      atEventType: stop.event?.type,
      reason,
    });
    from = stop.minute;
    if (stop.kind === "emergency_stop") {
      stoppedByEmergency = true;
      stopEventId = stop.event?.id ?? null;
      break;
    }
  }

  if (!stoppedByEmergency && from < targetMinute) {
    steps.push({ fromMinute: from, toMinute: targetMinute, kind: "arrive", reason: "推进至目标时刻" });
  }

  return {
    steps,
    targetMinute,
    plannedEndMinute: steps.length ? steps[steps.length - 1].toMinute : world.gameMinute,
    stoppedByEmergency,
    stopEventId,
  };
}

export type RestoreValidationReason = "match" | "mismatch" | "checksum_missing";

export interface BranchRestoreValidation {
  ok: boolean;
  reason: RestoreValidationReason;
}

export function validateBranchRestore(
  snapshotChecksum: string,
  replayedChecksum: string,
): BranchRestoreValidation {
  if (!snapshotChecksum || !replayedChecksum) {
    return { ok: false, reason: "checksum_missing" };
  }
  if (snapshotChecksum === replayedChecksum) {
    return { ok: true, reason: "match" };
  }
  return { ok: false, reason: "mismatch" };
}

// 确定性校验和:快照负载与回放投影输入一致时输出一致,用于恢复一致性判定。
export function computeSnapshotChecksum(input: unknown): string {
  const text = JSON.stringify(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(36)}`;
}

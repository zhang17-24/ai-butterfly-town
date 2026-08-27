import { describe, expect, it } from "vitest";
import {
  computeSnapshotChecksum,
  buildSkipSchedule,
  shouldSnapshot,
  validateBranchRestore,
} from "./snapshot-logic.js";

describe("shouldSnapshot", () => {
  it("周期触发:每 60 世界分钟边界创建快照", () => {
    expect(shouldSnapshot(42, 480, "notice", 5)).toEqual({ should: true, reason: "periodic" });
    expect(shouldSnapshot(42, 540, "notice", 5)).toEqual({ should: true, reason: "periodic" });
    expect(shouldSnapshot(42, 481, "notice", 5)).toEqual({ should: false, reason: "normal" });
  });

  it("重大事件触发:与分钟无关,任意时刻都创建快照", () => {
    expect(shouldSnapshot(12, 30, "factory_fire", 3)).toEqual({ should: true, reason: "major_event" });
    expect(shouldSnapshot(12, 30, "flood", 3)).toEqual({ should: true, reason: "major_event" });
    expect(shouldSnapshot(12, 30, "weather_alert", 3)).toEqual({ should: false, reason: "normal" });
  });

  it("初始状态(version 0 或 0 分钟)不触发快照", () => {
    expect(shouldSnapshot(0, 0, "notice", 0)).toEqual({ should: false, reason: "initial_state" });
    expect(shouldSnapshot(1, 0, "notice", 0)).toEqual({ should: false, reason: "initial_state" });
  });

  it("滚动快照达到上限后周期触发被抑制,重大事件仍保留机会", () => {
    expect(shouldSnapshot(10, 660, "notice", 96)).toEqual({ should: false, reason: "cap_reached" });
    expect(shouldSnapshot(10, 660, "factory_fire", 96)).toEqual({ should: true, reason: "major_event" });
    expect(shouldSnapshot(10, 660, "notice", 95)).toEqual({ should: true, reason: "periodic" });
  });

  it("可注入间隔 / 重大事件集", () => {
    expect(shouldSnapshot(5, 90, "notice", 1, { intervalMinutes: 30 })).toEqual({ should: true, reason: "periodic" });
    expect(shouldSnapshot(5, 30, "quake", 1, { majorEventTypes: ["quake"] })).toEqual({ should: true, reason: "major_event" });
  });
});

describe("buildSkipSchedule", () => {
  const worldAtOpen = (minute: number, events: Array<{ id: string; gameMinute: number; type: string }>) => ({
    gameMinute: minute,
    events,
  });

  it("常规跳过:逐事件暂停,最后推进到达目标分钟", () => {
    const schedule = buildSkipSchedule(
      worldAtOpen(480, [
        { id: "ev_alert", gameMinute: 505, type: "weather_alert" },
        { id: "ev_market", gameMinute: 555, type: "market_incident" },
      ]),
      560,
    );
    expect(schedule.stoppedByEmergency).toBe(false);
    expect(schedule.plannedEndMinute).toBe(560);
    expect(schedule.steps).toEqual([
      { fromMinute: 480, toMinute: 505, kind: "advance", atEventId: "ev_alert", atEventType: "weather_alert", reason: "推进至事件(weather_alert)" },
      { fromMinute: 505, toMinute: 555, kind: "advance", atEventId: "ev_market", atEventType: "market_incident", reason: "推进至事件(market_incident)" },
      { fromMinute: 555, toMinute: 560, kind: "arrive", reason: "推进至目标时刻" },
    ]);
  });

  it("紧急事件自动停止:在紧急事件前一分钟停止,后续不再规划", () => {
    const schedule = buildSkipSchedule(
      worldAtOpen(480, [
        { id: "ev_alert", gameMinute: 505, type: "weather_alert" },
        { id: "ev_fire", gameMinute: 520, type: "factory_fire" },
        { id: "ev_beyond", gameMinute: 540, type: "notice" },
      ]),
      560,
    );
    expect(schedule.stoppedByEmergency).toBe(true);
    expect(schedule.stopEventId).toBe("ev_fire");
    expect(schedule.plannedEndMinute).toBe(520);
    expect(schedule.steps).toEqual([
      { fromMinute: 480, toMinute: 505, kind: "advance", atEventId: "ev_alert", atEventType: "weather_alert", reason: "推进至事件(weather_alert)" },
      { fromMinute: 505, toMinute: 520, kind: "emergency_stop", atEventId: "ev_fire", atEventType: "factory_fire", reason: "紧急事件(factory_fire)将临,跳过推进提前停止" },
    ]);
  });

  it("当前动作结束是第一个暂停点,之后再推进到目标", () => {
    const schedule = buildSkipSchedule(
      { gameMinute: 480, currentActionEndsAtMinute: 495, events: [] },
      560,
    );
    expect(schedule.steps).toEqual([
      { fromMinute: 480, toMinute: 495, kind: "advance", reason: "当前动作结束,续跳" },
      { fromMinute: 495, toMinute: 560, kind: "arrive", reason: "推进至目标时刻" },
    ]);
  });

  it("无事件无动作时一步跳到目标分钟", () => {
    const schedule = buildSkipSchedule(worldAtOpen(480, []), 560);
    expect(schedule.steps).toHaveLength(1);
    expect(schedule.steps[0]).toMatchObject({ fromMinute: 480, toMinute: 560, kind: "arrive" });
    expect(schedule.plannedEndMinute).toBe(560);
  });

  it("紧急事件在目标时刻之后不影响跳过计划", () => {
    const schedule = buildSkipSchedule(
      worldAtOpen(480, [{ id: "ev_fire_600", gameMinute: 600, type: "factory_fire" }]),
      560,
    );
    expect(schedule.stoppedByEmergency).toBe(false);
    expect(schedule.plannedEndMinute).toBe(560);
    expect(schedule.steps[0]).toMatchObject({ kind: "arrive", toMinute: 560 });
  });

  it("目标不大于当前时刻时返回空计划", () => {
    const schedule = buildSkipSchedule(worldAtOpen(480, [{ id: "ev", gameMinute: 505, type: "notice" }]), 480);
    expect(schedule.steps).toEqual([]);
    expect(schedule.plannedEndMinute).toBe(480);
    expect(schedule.stoppedByEmergency).toBe(false);
  });

  it("事件乱序输入自动按分钟排序", () => {
    const schedule = buildSkipSchedule(
      worldAtOpen(480, [
        { id: "ev_market", gameMinute: 555, type: "market_incident" },
        { id: "ev_alert", gameMinute: 505, type: "weather_alert" },
      ]),
      560,
    );
    expect(schedule.steps.map((step) => step.atEventId)).toEqual(["ev_alert", "ev_market", undefined]);
  });
});

describe("validateBranchRestore / computeSnapshotChecksum", () => {
  it("校验和一致:恢复校验通过", () => {
    expect(validateBranchRestore("fnv1a:abc123", "fnv1a:abc123")).toEqual({ ok: true, reason: "match" });
  });

  it("校验和不一致:拒绝恢复,不覆盖已有世界", () => {
    expect(validateBranchRestore("fnv1a:snapshot", "fnv1a:replayed")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("缺失校验和:拒绝恢复", () => {
    expect(validateBranchRestore("", "fnv1a:x")).toEqual({ ok: false, reason: "checksum_missing" });
    expect(validateBranchRestore("fnv1a:x", "")).toEqual({ ok: false, reason: "checksum_missing" });
  });

  it("computeSnapshotChecksum 确定性且随输入变化", () => {
    const state = { gameMinute: 480, npcs: [{ id: "npc_a", action: "walk" }] };
    expect(computeSnapshotChecksum(state)).toBe(computeSnapshotChecksum(state));
    expect(computeSnapshotChecksum(state)).not.toBe(computeSnapshotChecksum({ ...state, gameMinute: 481 }));
  });
});

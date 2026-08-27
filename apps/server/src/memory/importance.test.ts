import { describe, expect, it } from "vitest";
import {
  IMPORTANCE_BASE,
  computeMemoryImportance,
  type ImportanceInput,
} from "./importance.js";

function input(overrides: Partial<ImportanceInput>): ImportanceInput {
  return { kind: "dialogue", ...overrides };
}

describe("computeMemoryImportance(§4.2)", () => {
  it("基线 40:普通对话/行动无任何因子", () => {
    expect(computeMemoryImportance(input({}))).toBe(IMPORTANCE_BASE);
    expect(computeMemoryImportance(input({ kind: "action", actionFailed: false }))).toBe(IMPORTANCE_BASE);
  });

  it("重大事件(snapshot-logic 同集)+15,非重大事件不加", () => {
    expect(computeMemoryImportance(input({ kind: "event", eventType: "factory_fire" }))).toBe(55);
    expect(computeMemoryImportance(input({ kind: "event", eventType: "flood" }))).toBe(55);
    expect(computeMemoryImportance(input({ kind: "event", eventType: "weather_alert" }))).toBe(40);
  });

  it("极端状态 +20", () => {
    expect(computeMemoryImportance(input({ stateExtreme: true }))).toBe(60);
  });

  it("关系变动 ≥10 绝对值 +15,低于阈值不加", () => {
    expect(computeMemoryImportance(input({ relationDeltaAbs: 12 }))).toBe(55);
    expect(computeMemoryImportance(input({ relationDeltaAbs: 8 }))).toBe(40);
    expect(computeMemoryImportance(input({ relationDeltaAbs: null }))).toBe(40);
  });

  it("亲身涉事(involved)+10,仅目击不加", () => {
    expect(computeMemoryImportance(input({ kind: "event", via: "involved" }))).toBe(50);
    expect(computeMemoryImportance(input({ kind: "event", via: "sight" }))).toBe(40);
  });

  it("情绪标注:负面 > 正面 > 中性", () => {
    const negative = computeMemoryImportance(input({ tone: "negative" }));
    const positive = computeMemoryImportance(input({ tone: "positive" }));
    const neutral = computeMemoryImportance(input({ tone: "neutral" }));
    expect(negative).toBe(50);
    expect(positive).toBe(45);
    expect(neutral).toBe(40);
    expect(negative).toBeGreaterThan(positive);
    expect(positive).toBeGreaterThan(neutral);
  });

  it("行动失败(受挫)+10", () => {
    expect(computeMemoryImportance(input({ kind: "action", actionFailed: true }))).toBe(50);
  });

  it("多因子累加后夹取上限 100", () => {
    const score = computeMemoryImportance(input({
      kind: "event",
      eventType: "factory_fire",
      via: "involved",
      stateExtreme: true,
      relationDeltaAbs: 15,
      tone: "negative",
    }));
    expect(score).toBe(100);
  });
});

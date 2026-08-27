import { describe, expect, it } from "vitest";
import {
  MOCK_REFLECTION_BONUS_CAP,
  MOCK_REFLECTION_BONUS_PER_HIT,
  computeMemoryRelevanceBonus,
  type BonusCandidate,
} from "./mock-decision-bonus.js";

const candidate: BonusCandidate = {
  id: "c_market",
  label: "去市集采购",
  destinationId: "riverside",
  reason: "上午市集人多,计划契合",
};

describe("computeMemoryRelevanceBonus(§7.1)", () => {
  it("记忆与候选字段 2-gram 命中 → 每条 +0.06", () => {
    const result = computeMemoryRelevanceBonus(candidate, [
      { id: "m1", content: "市集摊位被取消了" },
      { id: "m2", content: "河岸最近很安静" },
    ]);
    expect(result.matchCount).toBe(1);
    expect(result.bonus).toBe(MOCK_REFLECTION_BONUS_PER_HIT);
    expect(result.matchedMemoryIds).toEqual(["m1"]);
  });

  it("候选对象/地点/动作多字段命中同一记忆只计 1 次", () => {
    const result = computeMemoryRelevanceBonus(candidate, [
      { id: "m1", content: "市集上遇到了老周" },
    ]);
    expect(result.matchCount).toBe(1);
    expect(result.bonus).toBe(MOCK_REFLECTION_BONUS_PER_HIT);
  });

  it("不命中 → 0(退化安全,Mock 评分与无记忆一致)", () => {
    const result = computeMemoryRelevanceBonus(candidate, [
      { id: "m1", content: "在家修了半天伞" },
    ]);
    expect(result).toEqual({ bonus: 0, matchCount: 0, matchedMemoryIds: [] });
  });

  it("5 条命中达到上限 0.30,更多条不超限", () => {
    const memories = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, content: `市集第${i}次记录` }));
    const capped = computeMemoryRelevanceBonus(candidate, memories);
    expect(capped.matchCount).toBe(9);
    expect(capped.bonus).toBe(MOCK_REFLECTION_BONUS_CAP);
  });

  it("固定输入恒等输出", () => {
    const memories = [{ id: "m1", content: "市集摊位被取消了" }];
    const first = computeMemoryRelevanceBonus(candidate, memories);
    const second = computeMemoryRelevanceBonus(candidate, memories);
    expect(second).toEqual(first);
  });
});

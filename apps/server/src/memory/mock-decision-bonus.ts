/**
 * Mock 决策的记忆加成(design spec §7.1):
 * 候选动作文本与召回记忆的 2-gram 字面匹配 → 每条记忆至多计 1 次,bonus = 0.06 × count,上限 0.30。
 * 纯函数;记忆不参与时返回 0(退化安全)。
 */
import { tokenizeQuery } from "./retrieval.js";

export const MOCK_REFLECTION_BONUS_PER_HIT = 0.06;
export const MOCK_REFLECTION_BONUS_CAP = 0.30;

export interface BonusCandidate {
  id: string;
  label: string;
  destinationId?: string | null;
  reason?: string;
}

export interface MemoryBonus {
  bonus: number;
  matchCount: number;
  matchedMemoryIds: string[];
}

export function computeMemoryRelevanceBonus(
  candidate: BonusCandidate,
  recalled: Array<{ id: string; content: string }>,
): MemoryBonus {
  const corpus = [candidate.id, candidate.label, candidate.destinationId, candidate.reason]
    .filter((part): part is string => part !== undefined && part !== null && part.length > 0)
    .join(" ");

  const matchedMemoryIds: string[] = [];
  for (const memory of recalled) {
    const tokens = tokenizeQuery(memory.content);
    if (tokens.length === 0) continue;
    const hit = tokens.some((token) => corpus.includes(token));
    if (hit) {
      matchedMemoryIds.push(memory.id);
    }
  }

  const matchCount = matchedMemoryIds.length;
  const bonus = Math.min(MOCK_REFLECTION_BONUS_CAP, MOCK_REFLECTION_BONUS_PER_HIT * matchCount);
  return { bonus: Math.round(bonus * 100) / 100, matchCount, matchedMemoryIds };
}

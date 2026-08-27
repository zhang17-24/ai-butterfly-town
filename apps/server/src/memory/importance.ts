/**
 * importance 写时标注纯函数(design spec §4.2)。
 * 规则兜底对 Mock 与 AI 均生效:AI 附注分与规则分取 max,本模块只产规则分。
 */
import { MAJOR_EVENT_TYPES } from "../timeline/snapshot-logic.js";
import type { MemoryKind } from "./retrieval.js";

export const IMPORTANCE_BASE = 40;
export const IMPORTANCE_MAJOR_EVENT = 15;
export const IMPORTANCE_STATE_EXTREME = 20;
export const IMPORTANCE_RELATION_DELTA = 15;
export const IMPORTANCE_RELATION_DELTA_MIN = 10;
export const IMPORTANCE_INVOLVED = 10;
export const IMPORTANCE_NEGATIVE_TONE = 10;
export const IMPORTANCE_POSITIVE_TONE = 5;
export const IMPORTANCE_ACTION_ABNORMAL = 10;

export interface ImportanceInput {
  kind: MemoryKind;
  /** kind=event 的事件类型;∈ MAJOR_EVENT_TYPES(snapshot-logic 同集)时 +15 */
  eventType?: string | null;
  /** 事件亲身程度:involved +10;sight/hearing 不加 */
  via?: "involved" | "sight" | "hearing" | "public" | null;
  /** 情绪标注:negative +10,positive +5 */
  tone?: "positive" | "negative" | "neutral" | null;
  /** 内容涉及 NPC 状态 <20 或 >85(任一核心状态) */
  stateExtreme?: boolean;
  /** 同事务关系变化绝对值;≥10 才 +15 */
  relationDeltaAbs?: number | null;
  /** 行动结果异常(failed/受挫) */
  actionFailed?: boolean;
}

export function computeMemoryImportance(input: ImportanceInput): number {
  let score = IMPORTANCE_BASE;

  const majorTypes: readonly string[] = MAJOR_EVENT_TYPES;
  if (input.kind === "event" && input.eventType && majorTypes.includes(input.eventType)) {
    score += IMPORTANCE_MAJOR_EVENT;
  }
  if (input.stateExtreme) {
    score += IMPORTANCE_STATE_EXTREME;
  }
  if (input.relationDeltaAbs !== null && input.relationDeltaAbs !== undefined && input.relationDeltaAbs >= IMPORTANCE_RELATION_DELTA_MIN) {
    score += IMPORTANCE_RELATION_DELTA;
  }
  if (input.kind === "event" && input.via === "involved") {
    score += IMPORTANCE_INVOLVED;
  }
  if (input.tone === "negative") {
    score += IMPORTANCE_NEGATIVE_TONE;
  } else if (input.tone === "positive") {
    score += IMPORTANCE_POSITIVE_TONE;
  }
  if (input.kind === "action" && input.actionFailed) {
    score += IMPORTANCE_ACTION_ABNORMAL;
  }

  return Math.max(1, Math.min(100, Math.round(score)));
}

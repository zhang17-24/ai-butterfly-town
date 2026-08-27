/**
 * 上下文注入模板格式化(design spec §6.5)。
 * 纯字符串组装:决策/对话 Prompt builder 与本模块协作,保证注入格式一致、可复现。
 */
import type { RecalledMemory } from "./retrieval.js";
import { formatWorldMinute } from "./summarize.js";

export interface RelatedAgentInfo {
  agentId: string;
  summary: string | null;
}

export const NO_RELATION_TEXT = "暂无认识";

/** 单条记忆注入行(§6.5):时间 | 类型 | 重要度;对象;内容;(理由) */
export function buildMemoryCaption(memory: RecalledMemory): string {
  const subjectLine = memory.subject !== null && memory.subject !== "" ? `对象:${memory.subject} ` : "";
  const reasonLine = `(${memory.reasons.join(";")})`;
  return [
    `${formatWorldMinute(memory.createdAt)} | 类型:${memory.kind} | 重要度:${memory.importance} ${subjectLine}`,
    `  ${memory.content}`,
    `  ${reasonLine}`,
  ].join("\n");
}

/** §6.5 完整上下文块:[相关经历] + [与目标的关系印象](关系印象段可空) */
export function buildMemoryContextSection(
  recalled: RecalledMemory[],
  relation?: RelatedAgentInfo | null,
): string {
  const lines = ["[相关经历]"];
  if (recalled.length === 0) {
    lines.push("  (暂无相关经历)");
  } else {
    for (const memory of recalled) {
      lines.push(buildMemoryCaption(memory));
    }
  }
  if (relation) {
    lines.push(`[与 ${relation.agentId} 的关系印象]`);
    lines.push(`  ${relation.summary ?? NO_RELATION_TEXT}`);
  }
  return lines.join("\n");
}

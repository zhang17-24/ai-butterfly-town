/**
 * 记忆召回纯函数(design spec §6,评审修正:MVP 用纯内存 2-gram 匹配,不建 FTS 虚表)。
 * 无 IO:输入记忆视图数组 + 检索上下文,输出 Top-N 与可解释召回理由。
 */

export const MEMORY_KINDS = ["dialogue", "event", "action", "summary", "insight"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

// 新近度一律用世界分钟(种子可复现,不依赖墙钟);半衰期 = 1 世界日 = 24h × 60。
export const HALF_LIFE_WORLD_MINUTES = 1440;

export const WEIGHT_FTS = 0.45;
export const WEIGHT_IMPORTANCE = 0.35;
export const WEIGHT_RECENCY = 0.20;
export const WEIGHT_FTS_NO_TIME = 0.60;
export const WEIGHT_IMPORTANCE_NO_TIME = 0.40;
export const OBJECT_BONUS = 0.15;

export const HIGH_IMPORTANCE_THRESHOLD = 70;
export const RECENCY_HIGH_THRESHOLD = 0.7;
export const MAX_ENTRY_CHARS = 100;
export const DEFAULT_BUDGET = { maxEntries: 6, maxChars: 600 };

export interface MemoryEntryView {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  subject: string | null;
  /** 世界分钟(自演示起点 08:20 起算),新近度唯一基准 */
  createdAtMinute: number;
  archived: boolean;
  sourceIdentifier?: string | null;
}

export interface RecallContext {
  agentId: string;
  /** 当前任务/用户消息的检索文本,按 §6.3 2-gram 化 */
  query: string;
  /** 当前世界分钟;null = 只用重要性+相关度 */
  worldTimeMinute: number | null;
  relatedAgentId?: string;
  locationId?: string;
  budget?: { maxEntries: number; maxChars: number };
}

export interface RecallScore {
  total: number;
  fts: number;
  importanceScaled: number;
  recency: number | null;
  objectBonus: number;
}

export interface RecalledMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  subject: string | null;
  /** 世界分钟 */
  createdAt: number;
  score: RecallScore;
  reasons: string[];
}

const isChinese = (ch: string) => ch >= "一" && ch <= "龥";
const isAsciiWord = (ch: string) => /[0-9A-Za-z_]/.test(ch);

/**
 * 词项化:中文连续段按 2-gram 切分("市集取消" → 市集/集取/取消),
 * 英文/数字/下划线为一个词,统一小写;结果保序去重。
 */
export function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  let chinese = "";
  let ascii = "";

  const flushAscii = () => {
    if (ascii.length > 0) {
      tokens.push(ascii.toLowerCase());
      ascii = "";
    }
  };
  const flushChinese = () => {
    for (let i = 0; i + 1 < chinese.length; i++) {
      tokens.push(chinese.slice(i, i + 2));
    }
    chinese = "";
  };
  const flushAll = () => {
    flushAscii();
    flushChinese();
  };

  for (const ch of query) {
    if (isChinese(ch)) {
      if (ascii.length > 0) {
        flushAscii();
      }
      chinese += ch;
    } else if (isAsciiWord(ch)) {
      if (chinese.length > 0) {
        flushChinese();
      }
      ascii += ch;
    } else {
      flushAll();
    }
  }
  flushAll();
  return [...new Set(tokens)];
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

function truncateTo(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("") + "…";
}

export function retrieveMemories(entries: MemoryEntryView[], ctx: RecallContext): RecalledMemory[] {
  const budget = ctx.budget ?? DEFAULT_BUDGET;
  const tokens = tokenizeQuery(ctx.query);
  const agentHit = ctx.relatedAgentId !== undefined && ctx.relatedAgentId !== null;
  const locationHit = ctx.locationId !== undefined && ctx.locationId !== null;

  const recalled: RecalledMemory[] = [];
  for (const entry of entries) {
    if (entry.archived) continue;

    let hits: string[] = [];
    if (tokens.length > 0) {
      hits = tokens.filter((token) => entry.content.includes(token));
    }
    const ftsScore = tokens.length > 0 ? hits.length / tokens.length : 0;

    const importanceScaled = entry.importance / 100;
    const recency = ctx.worldTimeMinute === null
      ? null
      : Math.exp((-Math.max(0, ctx.worldTimeMinute - entry.createdAtMinute) / HALF_LIFE_WORLD_MINUTES) * Math.LN2);

    let objectBonus = 0;
    let objectReason: string | null = null;
    if (entry.subject !== null) {
      if (entry.subject === ctx.relatedAgentId) {
        objectBonus = OBJECT_BONUS;
        objectReason = `与当前对象(${ctx.relatedAgentId})直接相关`;
      } else if (entry.subject === ctx.locationId) {
        objectBonus = OBJECT_BONUS;
        objectReason = `与当前地点(${ctx.locationId})相关`;
      }
    }

    const total = recency === null
      ? WEIGHT_FTS_NO_TIME * ftsScore + WEIGHT_IMPORTANCE_NO_TIME * importanceScaled + objectBonus
      : WEIGHT_FTS * ftsScore + WEIGHT_IMPORTANCE * importanceScaled + WEIGHT_RECENCY * recency + objectBonus;

    const reasons: string[] = [];
    if (hits.length > 0) reasons.push(`命中词:${hits.slice(0, 3).join("/")}`);
    if (entry.importance >= HIGH_IMPORTANCE_THRESHOLD) {
      reasons.push(`高重要经历(${entry.importance}/100)`);
    }
    if (recency !== null && recency >= RECENCY_HIGH_THRESHOLD) {
      reasons.push("1 天内存下的新近记忆");
    }
    if (objectReason !== null) reasons.push(objectReason);
    if (entry.kind === "insight") reasons.push("长期认识");
    if (reasons.length === 0) reasons.push("默认相关度排序");

    recalled.push({
      id: entry.id,
      kind: entry.kind,
      content: truncateTo(entry.content, MAX_ENTRY_CHARS),
      importance: entry.importance,
      subject: entry.subject,
      createdAt: entry.createdAtMinute,
      score: { total: round4(total), fts: round4(ftsScore), importanceScaled: round4(importanceScaled), recency: recency === null ? null : round4(recency), objectBonus },
      reasons,
    });
  }

  recalled.sort((a, b) => b.score.total - a.score.total);

  const limited = recalled.slice(0, budget.maxEntries);
  const accepted: RecalledMemory[] = [];
  let usedChars = 0;
  for (const item of limited) {
    const length = Array.from(item.content).length + 2;
    if (usedChars + length > budget.maxChars) break;
    usedChars += length;
    accepted.push(item);
  }
  return accepted;
}

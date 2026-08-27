/**
 * 按日复盘与长期压缩纯函数(design spec §5 与 §2.1 裁剪):
 * 分簇 → Mock 摘要模板 → insight 触发/去重 → 归档裁剪决策。
 * 全部确定性,输入固定输出固定;AI 压缩器在接线期以同签名替换模板。
 */
import { tokenizeQuery, type MemoryKind } from "./retrieval.js";

// D123:世界从周六 08:20 开始(500 分钟);世界日 = 1440 分钟。
export const TIMELINE_START_MINUTE = 500;
export const DAY_MINUTES = 1440;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const START_WEEKDAY_INDEX = 6; // 周六

export const SUMMARY_MAX_CHARS = 120;
export const SUMMARY_HEAD_CHARS = 30;
export const SUMMARY_TOP_ITEMS = 3;

export const REFLECT_HIGH_COUNT = 3;
export const REFLECT_HIGH_THRESHOLD = 70;
export const REFLECT_SAME_DAY_COUNT = 2;
export const REFLECT_WEEK_COUNT = 4;
export const REFLECT_REPEAT_THRESHOLD = 60;

export const INSIGHT_MAX_COUNT = 20;
export const INSIGHT_DUPLICATE_OVERLAP = 0.6;

export const SHORT_KEEP_COUNT = 40;
export const SHORT_PROTECT_IMPORTANCE = 85;
export const SUMMARY_KEEP_DAYS = 7;

export interface TimelineEntry {
  id: string;
  kind: MemoryKind;
  subject: string | null;
  content: string;
  importance: number;
  createdAtMinute: number;
}

/** 世界分钟 → "周六 08:20"式可见标签。world 分钟自第 0 日 00:00 起算,演示起点 08:20 = 500 */
export function formatWorldMinute(minute: number): string {
  const day = Math.floor(minute / DAY_MINUTES);
  const weekday = WEEKDAYS[(START_WEEKDAY_INDEX + day) % 7];
  const dayMinute = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour = Math.floor(dayMinute / 60);
  const mm = dayMinute % 60;
  return `${weekday} ${String(hour).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 世界日序号(0 = 起步日周六);500 → 0,1940 → 1 */
export function worldDayNumber(minute: number): number {
  return Math.floor(minute / DAY_MINUTES);
}

/** 按 subject 分簇,保留出现顺序;null 归入 null 簇 */
export function clusterBySubject(entries: TimelineEntry[]): Map<string | null, TimelineEntry[]> {
  const clusters = new Map<string | null, TimelineEntry[]>();
  for (const entry of entries) {
    const key = entry.subject ?? null;
    const list = clusters.get(key);
    if (list) {
      list.push(entry);
    } else {
      clusters.set(key, [entry]);
    }
  }
  return clusters;
}

const truncateTo = (text: string, max: number) => {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("") + "…";
};

/**
 * Mock 摘要模板(Mock 分支,接线期与 AI 压缩器同签名互替):
 * `{日期}:{主题}相关经历 {k} 条 —— {top3 内容头 30 字}`,≤120 字,重要性降序取前 3。
 */
export function buildMockSummary(entries: TimelineEntry[], subjectLabel: string, dateLabel: string): string {
  const top = [...entries].sort((a, b) => b.importance - a.importance).slice(0, SUMMARY_TOP_ITEMS);
  const head = top.map((item) => truncateTo(item.content, SUMMARY_HEAD_CHARS)).join("、");
  const subjectText = subjectLabel === null || subjectLabel === "" ? "" : `${subjectLabel}`;
  const summary = `${dateLabel}:${subjectText ? `${subjectText}相关` : "当日短"}经历 ${entries.length} 条 —— ${head}`;
  return truncateTo(summary, SUMMARY_MAX_CHARS);
}

export interface ReflectDecision {
  should: boolean;
  trigger: "high_importance" | "repeated_subject" | null;
}

export function shouldReflect(dayEntries: TimelineEntry[], weekEntries: TimelineEntry[]): ReflectDecision {
  const high = dayEntries.filter((entry) => entry.importance >= REFLECT_HIGH_THRESHOLD);
  if (high.length >= REFLECT_HIGH_COUNT) {
    return { should: true, trigger: "high_importance" };
  }

  const dayGroups = new Map<string | null, TimelineEntry[]>();
  for (const entry of dayEntries) {
    if (entry.importance >= REFLECT_REPEAT_THRESHOLD) {
      const key = entry.subject ?? null;
      const list = dayGroups.get(key) ?? [];
      list.push(entry);
      dayGroups.set(key, list);
    }
  }
  for (const group of dayGroups.values()) {
    if (group.length >= REFLECT_SAME_DAY_COUNT) {
      return { should: true, trigger: "repeated_subject" };
    }
  }

  const weekGroups = new Map<string | null, TimelineEntry[]>();
  for (const entry of weekEntries) {
    if (entry.importance >= REFLECT_REPEAT_THRESHOLD) {
      const key = entry.subject ?? null;
      const list = weekGroups.get(key) ?? [];
      list.push(entry);
      weekGroups.set(key, list);
    }
  }
  for (const group of weekGroups.values()) {
    if (group.length >= REFLECT_WEEK_COUNT) {
      return { should: true, trigger: "repeated_subject" };
    }
  }

  return { should: false, trigger: null };
}

/** 词元重叠度(Dice):2|A∩B| / (|A|+|B|) */
function tokenOverlap(a: string, b: string): number {
  const setA = new Set(tokenizeQuery(a));
  const setB = new Set(tokenizeQuery(b));
  const total = setA.size + setB.size;
  if (total === 0) return 0;
  let common = 0;
  for (const token of setA) {
    if (setB.has(token)) common += 1;
  }
  return (2 * common) / total;
}

export interface ExistingInsight {
  id: string;
  content: string;
  subject: string | null;
}

/** 同主题且词元重叠 ≥60% → 返回既有 insight(接线侧执行"更新而非新建") */
export function findDuplicateInsight(existingInsights: ExistingInsight[], candidate: { content: string; subject: string | null }): ExistingInsight | null {
  for (const insight of existingInsights) {
    if (insight.subject !== candidate.subject) continue;
    if (tokenOverlap(insight.content, candidate.content) >= INSIGHT_DUPLICATE_OVERLAP) {
      return insight;
    }
  }
  return null;
}

export const SHORT_KINDS: ReadonlySet<MemoryKind> = new Set(["dialogue", "event", "action"]);

export interface RetentionEntry extends TimelineEntry {
  /** 是否已被当日 summary 覆盖(subject 匹配进摘要);false/null 视为未覆盖 */
  inSummaryCoverage: boolean | null;
}

/**
 * 归档裁剪决策(§5.3 覆盖检查 + 分层滚动):
 * - 短期(对话/事件/行动):保留最新 SHORT_KEEP_COUNT 条 + importance≥SHORT_PROTECT_IMPORTANCE 保底;
 *   其余**仅当已被摘要覆盖**才归档(覆盖检查阻止未摘要条目被删);
 * - summary:保留近 SUMMARY_KEEP_DAYS 世界日,更早归档;
 * - insight:永不归档(只超限合并,$5.5)。
 */
export function planArchiveEntries(entries: RetentionEntry[], nowMinute: number): { archiveIds: string[]; keptCount: number } {
  const archiveIds: string[] = [];

  const short = entries.filter((entry) => SHORT_KINDS.has(entry.kind));
  const sorted = [...short].sort((a, b) => b.createdAtMinute - a.createdAtMinute);
  sorted.forEach((entry, index) => {
    const protectedByRecency = index < SHORT_KEEP_COUNT;
    const protectedByImportance = entry.importance >= SHORT_PROTECT_IMPORTANCE;
    if (protectedByRecency || protectedByImportance) return;
    if (entry.inSummaryCoverage === true) {
      archiveIds.push(entry.id);
    }
  });

  const summaries = entries.filter((entry) => entry.kind === "summary");
  for (const entry of summaries) {
    const age = nowMinute - entry.createdAtMinute;
    if (age > SUMMARY_KEEP_DAYS * DAY_MINUTES) {
      archiveIds.push(entry.id);
    }
  }

  const retained = entries.length - archiveIds.length;
  return { archiveIds, keptCount: retained };
}

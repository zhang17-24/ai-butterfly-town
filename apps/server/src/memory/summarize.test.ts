import { describe, expect, it } from "vitest";
import {
  buildMockSummary,
  clusterBySubject,
  findDuplicateInsight,
  formatWorldMinute,
  planArchiveEntries,
  shouldReflect,
  worldDayNumber,
  type RetentionEntry,
  type TimelineEntry,
} from "./summarize.js";
import { DAY_MINUTES, TIMELINE_START_MINUTE } from "./summarize.js";

function timeline(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: "t1",
    kind: "dialogue",
    subject: null,
    content: "普通经历",
    importance: 40,
    createdAtMinute: TIMELINE_START_MINUTE + 20,
    ...overrides,
  };
}

function retention(overrides: Partial<RetentionEntry>): RetentionEntry {
  return { ...timeline(overrides), inSummaryCoverage: null, ...overrides };
}

describe("formatWorldMinute / worldDayNumber", () => {
  it("起点 08:20 为周六,跨日后为周日", () => {
    expect(formatWorldMinute(TIMELINE_START_MINUTE)).toBe("周六 08:20");
    expect(formatWorldMinute(TIMELINE_START_MINUTE + 40)).toBe("周六 09:00");
    expect(formatWorldMinute(TIMELINE_START_MINUTE + DAY_MINUTES)).toBe("周日 08:20");
    expect(formatWorldMinute(TIMELINE_START_MINUTE + DAY_MINUTES * 2)).toBe("周一 08:20");
  });

  it("worldDayNumber 以 500 为第 0 日", () => {
    expect(worldDayNumber(TIMELINE_START_MINUTE)).toBe(0);
    expect(worldDayNumber(TIMELINE_START_MINUTE + DAY_MINUTES)).toBe(1);
  });
});

describe("clusterBySubject", () => {
  it("按 subject 分簇且保留插入顺序,null 归独立簇", () => {
    const entries = [
      timeline({ id: "a", subject: "npc_lin_xia" }),
      timeline({ id: "b", subject: null }),
      timeline({ id: "c", subject: "npc_lin_xia" }),
    ];
    const clusters = clusterBySubject(entries);
    expect([...clusters.keys()]).toEqual(["npc_lin_xia", null]);
    expect(clusters.get("npc_lin_xia")!.map((item) => item.id)).toEqual(["a", "c"]);
  });
});

describe("buildMockSummary(§5.2)", () => {
  it("模板:日期+主题+条数+重要性降序前 3 条内容头 30 字", () => {
    const entries = [
      timeline({ id: "low", content: "x".repeat(50), importance: 30 }),
      timeline({ id: "high", content: "市集摊位即将关闭", importance: 80 }),
      timeline({ id: "mid", content: "阿晓邀请我去咖啡馆", importance: 60 }),
      timeline({ id: "high2", content: "河岸到处都是风", importance: 75 }),
    ];
    const summary = buildMockSummary(entries, "市集", "周六 18:00");
    expect(summary).toBe("周六 18:00:市集相关经历 4 条 —— 市集摊位即将关闭、河岸到处都是风、阿晓邀请我去咖啡馆");
    expect(Array.from(summary).length).toBeLessThanOrEqual(120);
  });

  it("无 subject 走当日短经历模板;同一输入恒等输出", () => {
    const entries = [timeline({ content: "配了几趟货", importance: 40 })];
    const first = buildMockSummary(entries, "", "周六 18:00");
    const second = buildMockSummary(entries, "", "周六 18:00");
    expect(first).toBe("周六 18:00:当日短经历 1 条 —— 配了几趟货");
    expect(second).toEqual(first);
  });

  it("超 120 字截断加省略号", () => {
    const entries = Array.from({ length: 6 }, (_, i) => timeline({ id: `c${i}`, content: "甲乙丙丁".repeat(10), importance: 90 - i }));
    const summary = buildMockSummary(entries, "长主题", "周日 02:30");
    expect(Array.from(summary).length).toBeLessThanOrEqual(121);
  });
});

describe("shouldReflect(§5.4)", () => {
  it("当日 ≥3 条 importance≥70 → high_importance", () => {
    const day = [
      timeline({ importance: 80 }),
      timeline({ importance: 75 }),
      timeline({ importance: 90 }),
    ];
    expect(shouldReflect(day, day)).toEqual({ should: true, trigger: "high_importance" });
  });

  it("同 subject 当日 ≥2 条且 ≥60 → repeated_subject", () => {
    const day = [
      timeline({ subject: "npc_lin_xia", importance: 61 }),
      timeline({ subject: "npc_lin_xia", importance: 70 }),
    ];
    expect(shouldReflect(day, day)).toEqual({ should: true, trigger: "repeated_subject" });
  });

  it("7 日窗口同 subject 累计 ≥4 条且 ≥60 → repeated_subject,当日单独不足也触发", () => {
    const day = [timeline({ subject: "npc_shen_zhiheng", importance: 60 })];
    const week = [
      ...day,
      timeline({ subject: "npc_shen_zhiheng", importance: 65 }),
      timeline({ subject: "npc_shen_zhiheng", importance: 70 }),
      timeline({ subject: "npc_shen_zhiheng", importance: 62 }),
    ];
    expect(shouldReflect(day, week)).toEqual({ should: true, trigger: "repeated_subject" });
  });

  it("无触发条件时返回 false", () => {
    const day = [timeline({ importance: 40 })];
    expect(shouldReflect(day, day)).toEqual({ should: false, trigger: null });
  });
});

describe("findDuplicateInsight(§5.4 同主题去重)", () => {
  it("同 subject 且词元重叠 ≥60% → 返回既有条目", () => {
    const existing = [{ id: "ins1", content: "我明白了:市集取消需要提前准备预案", subject: "market" }];
    const candidate = { content: "我明白了:市集取消应当提前准备替代方案", subject: "market" };
    expect(findDuplicateInsight(existing, candidate)?.id).toBe("ins1");
  });

  it("不同 subject 或重叠不足 → null", () => {
    const existing = [{ id: "ins1", content: "我明白了:市集取消需要提前准备预案", subject: "market" }];
    expect(findDuplicateInsight(existing, { content: "市集取消需要提前准备预案", subject: "weather" })).toBeNull();
    expect(findDuplicateInsight(existing, { content: "阿晓早上建议改了菜单", subject: "market" })).toBeNull();
  });

  it("纯英文词元也参与重叠判断(空词元返回 0)", () => {
    expect(findDuplicateInsight([{ id: "a", content: "", subject: null }], { content: "", subject: null })).toBeNull();
  });
});

describe("planArchiveEntries(§2.1/§5.3)", () => {
  const baseRetention: RetentionEntry[] = [];

  it("短期超过 40 条:第 41 条且在摘要覆盖内才归档,未覆盖保留", () => {
    const entries = [
      ...Array.from({ length: 40 }, (_, i) => retention({ id: `recent${i}`, importance: 40, createdAtMinute: 1000 + i })),
      retention({ id: "old_covered", importance: 30, createdAtMinute: 100, inSummaryCoverage: true }),
      retention({ id: "old_exposed", importance: 30, createdAtMinute: 100, inSummaryCoverage: false }),
    ];
    const result = planArchiveEntries(entries, 2000);
    expect(result.archiveIds).toEqual(["old_covered"]);
  });

  it("importance≥85 保底:即使超出 40 条且未靠新近也不归档", () => {
    const entries = [
      ...Array.from({ length: 40 }, (_, i) => retention({ id: `recent${i}`, importance: 40, createdAtMinute: 1000 + i })),
      retention({ id: "old_important", importance: 90, createdAtMinute: 100, inSummaryCoverage: true }),
    ];
    const result = planArchiveEntries(entries, 2000);
    expect(result.archiveIds).toEqual([]);
  });

  it("summary 超过 7 世界日归档,7 日内保留", () => {
    const now = 5000;
    const entries = [
      retention({ id: "sum_old", kind: "summary", createdAtMinute: now - 8 * DAY_MINUTES, inSummaryCoverage: null }),
      retention({ id: "sum_new", kind: "summary", createdAtMinute: now - 6 * DAY_MINUTES, inSummaryCoverage: null }),
    ];
    const result = planArchiveEntries(entries, now);
    expect(result.archiveIds).toEqual(["sum_old"]);
  });

  it("insight 永不归档", () => {
    const entries = [
      retention({ id: "ins_old", kind: "insight", content: "我明白了:凡事预则立", importance: 90, createdAtMinute: 100, inSummaryCoverage: null }),
    ];
    const result = planArchiveEntries(entries, 100000);
    expect(result.archiveIds).toEqual([]);
  });

  it("40 条边界内不产生候选;keptCount 正确", () => {
    const entries = Array.from({ length: 40 }, (_, i) => retention({ id: `r${i}`, importance: 40, createdAtMinute: 1000 + i }));
    const result = planArchiveEntries(entries, 3000);
    expect(result.archiveIds).toEqual([]);
    expect(result.keptCount).toBe(40);
  });
});

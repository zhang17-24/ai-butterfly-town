import { describe, expect, it } from "vitest";
import {
  HALF_LIFE_WORLD_MINUTES,
  OBJECT_BONUS,
  retrieveMemories,
  tokenizeQuery,
  type MemoryEntryView,
} from "./retrieval.js";

function entry(overrides: Partial<MemoryEntryView>): MemoryEntryView {
  return {
    id: "mem_1",
    kind: "dialogue",
    content: "普通对话一场",
    importance: 40,
    subject: null,
    createdAtMinute: 520,
    archived: false,
    ...overrides,
  };
}

describe("tokenizeQuery(§6.3)", () => {
  it("中文按连续段 2-gram 切分", () => {
    expect(tokenizeQuery("市集取消")).toEqual(["市集", "集取", "取消"]);
    expect(tokenizeQuery("暴雨天市集")).toEqual(["暴雨", "雨天", "天市", "市集"]);
  });

  it("英文/数字按下划线词切分并小写", () => {
    expect(tokenizeQuery("Market day_2")).toEqual(["market", "day_2"]);
    expect(tokenizeQuery("09:30")).toEqual(["09", "30"]);
  });

  it("中英混排分别切分", () => {
    expect(tokenizeQuery("暴雨 market")).toEqual(["暴雨", "market"]);
  });

  it("空串与纯标点不产生词项", () => {
    expect(tokenizeQuery("")).toEqual([]);
    expect(tokenizeQuery("...#$! ")).toEqual([]);
  });

  it("单字中文与重复词项去重保序", () => {
    expect(tokenizeQuery("雨")).toEqual([]);
    expect(tokenizeQuery("市集市集")).toEqual(["市集", "集市"]);
  });
});

describe("retrieveMemories 评分(§6.2)", () => {
  it("固定输入输出确定且排序按总分降序", () => {
    const entries = [
      entry({ id: "a", content: "在市集买了菜", importance: 60, createdAtMinute: 520 }),
      entry({ id: "b", content: "回家休息", importance: 40, createdAtMinute: 521 }),
    ];
    const first = retrieveMemories(entries, { agentId: "npc_lin_xia", query: "市集", worldTimeMinute: 560 });
    const second = retrieveMemories(entries, { agentId: "npc_lin_xia", query: "市集", worldTimeMinute: 560 });
    expect(second).toEqual(first);
    expect(first[0].id).toBe("a");
  });

  it("新近度:半衰期 1440 分钟处分值恰为 0.5,且时间越近分越高", () => {
    const entries = [
      entry({ id: "old", content: "很久以前的事", createdAtMinute: 480 - HALF_LIFE_WORLD_MINUTES }),
      entry({ id: "now", content: "就在刚才", createdAtMinute: 480 }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "以前", worldTimeMinute: 480 });
    const old = result.find((item) => item.id === "old")!;
    expect(old.score.recency).toBeCloseTo(0.5, 2);
    expect(result.find((item) => item.id === "now")!.score.recency).toBe(1);
  });

  it("对象加成:与相关 NPC 或地点匹配 +0.15,不匹配为 0", () => {
    const entries = [
      entry({ id: "npc", content: "林夏答应我帮我", subject: "npc_lin_xia", importance: 40, createdAtMinute: 520 }),
      entry({ id: "loc", content: "河岸市集很热闹", subject: "riverside", importance: 40, createdAtMinute: 520 }),
      entry({ id: "none", content: "无紧要的回忆", subject: null, importance: 40, createdAtMinute: 520 }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "", worldTimeMinute: 560, relatedAgentId: "npc_lin_xia", locationId: "riverside" });
    expect(result.find((item) => item.id === "npc")!.score.objectBonus).toBe(OBJECT_BONUS);
    expect(result.find((item) => item.id === "loc")!.score.objectBonus).toBe(OBJECT_BONUS);
    expect(result.find((item) => item.id === "none")!.score.objectBonus).toBe(0);
  });

  it("无世界时间时用 0.60/0.40 权重,recency 为 null", () => {
    const entries = [
      entry({ id: "imp", content: "紧急事件亲历", importance: 100, createdAtMinute: 100 }),
      entry({ id: "old", content: "市集旧事", importance: 40, createdAtMinute: 100 }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "", worldTimeMinute: null });
    expect(result[0].id).toBe("imp");
    for (const item of result) expect(item.score.recency).toBeNull();
  });
});

describe("召回理由(§6.4)", () => {
  it("命中词/高重要/新近/对象/长期认识各按条件出现,兜底保证 ≥1 条", () => {
    const entries = [
      entry({ id: "hit", content: "市集摊位被取消", importance: 78, subject: "npc_lin_xia", createdAtMinute: 2900 }),
      entry({ id: "ins", kind: "insight", content: "我明白了:承诺需要提前确认", importance: 90, createdAtMinute: 100 }),
      entry({ id: "plain", content: "发了会呆", importance: 40, createdAtMinute: 100 }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "市集取消", worldTimeMinute: 3000, relatedAgentId: "npc_lin_xia" });
    const hit = result.find((item) => item.id === "hit")!;
    expect(hit.reasons).toContain("命中词:市集/取消");
    expect(hit.reasons).toContain("高重要经历(78/100)");
    expect(hit.reasons).toContain("与当前对象(npc_lin_xia)直接相关");
    expect(hit.reasons.some((reason) => reason.includes("1 天内存下"))).toBe(true);
    const ins = result.find((item) => item.id === "ins")!;
    expect(ins.reasons).toContain("长期认识");
    const plain = result.find((item) => item.id === "plain")!;
    expect(plain.reasons).toEqual(["默认相关度排序"]);
  });
});

describe("预算截断(§6.2 末)", () => {
  it("maxEntries 限制条数,且保留高分", () => {
    const entries = Array.from({ length: 4 }, (_, i) => entry({ id: `m${i}`, content: `市集第${i}次记录`, importance: 40 + i, createdAtMinute: 520 + i }));
    const result = retrieveMemories(entries, { agentId: "a", query: "市集", worldTimeMinute: 560, budget: { maxEntries: 2, maxChars: 600 } });
    expect(result.map((item) => item.id)).toEqual(["m3", "m2"]);
  });

  it("单条超 100 字截断加省略号", () => {
    const longText = "市集".repeat(60);
    const result = retrieveMemories([entry({ id: "long", content: longText })], { agentId: "a", query: "市集", worldTimeMinute: null, budget: { maxEntries: 1, maxChars: 600 } });
    expect(Array.from(result[0].content).length).toBeLessThanOrEqual(101);
    expect(result[0].content.endsWith("…")).toBe(true);
  });

  it("总字符预算(maxChars)按下限移除后续条目", () => {
    const entries = [
      entry({ id: "big", content: "市集记录".repeat(30), importance: 40 }),
      entry({ id: "small", content: "市集一条", importance: 90 }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "市集", worldTimeMinute: null, budget: { maxEntries: 2, maxChars: 40 } });
    expect(result.map((item) => item.id)).toEqual(["small"]);
  });
});

describe("存档过滤与确定性", () => {
  it("archived=true 的记忆不参与召回", () => {
    const entries = [
      entry({ id: "kept", content: "市集新鲜事", importance: 90 }),
      entry({ id: "gone", content: "市集旧档案", importance: 90, archived: true }),
    ];
    const result = retrieveMemories(entries, { agentId: "a", query: "市集", worldTimeMinute: null });
    expect(result.map((item) => item.id)).toEqual(["kept"]);
  });
});

describe("召回内容去重", () => {
  it("同内容只保留最高分一条,并在保留条上标注合并", () => {
    const entries = [
      entry({ id: "dup_low", kind: "action", content: "我完成了：回公寓休息（在apartment）", importance: 40, createdAtMinute: 520 }),
      entry({ id: "dup_high", kind: "action", content: "我完成了：回公寓休息（在apartment）", importance: 40, createdAtMinute: 522 }),
      entry({ id: "other", kind: "action", content: "我完成了：巡视诊所", importance: 40, createdAtMinute: 523 }),
    ];
    const result = retrieveMemories(entries, { agentId: "npc_x", query: "下一步行动 回公寓休息", worldTimeMinute: 700 });
    expect(result.map((item) => item.id)).not.toContain("dup_low");
    expect(result.filter((item) => item.content.includes("回公寓休息"))).toHaveLength(1);
    const kept = result.find((item) => item.content.includes("回公寓休息"));
    expect(kept?.reasons.join(";")).toContain("重复内容已合并");
  });
});

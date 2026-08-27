import { describe, expect, it } from "vitest";
import { buildMemoryCaption, buildMemoryContextSection, NO_RELATION_TEXT } from "./caption.js";
import type { RecalledMemory } from "./retrieval.js";
import { TIMELINE_START_MINUTE } from "./summarize.js";

function recalled(overrides: Partial<RecalledMemory>): RecalledMemory {
  return {
    id: "mem_x",
    kind: "event",
    content: "市集摊位临时取消",
    importance: 78,
    subject: "market",
    createdAt: TIMELINE_START_MINUTE + 20,
    score: { total: 0.9, fts: 0.5, importanceScaled: 0.78, recency: 0.9, objectBonus: 0 },
    reasons: ["命中词:市集"],
    ...overrides,
  };
}

describe("buildMemoryCaption(§6.5)", () => {
  it("包含时间/类型/重要度/对象/内容/理由", () => {
    const caption = buildMemoryCaption(recalled({}));
    expect(caption).toContain("周六 08:40 | 类型:event | 重要度:78 对象:market");
    expect(caption).toContain("市集摊位临时取消");
    expect(caption).toContain("(命中词:市集)");
  });

  it("无 subject 时省略对象段", () => {
    const caption = buildMemoryCaption(recalled({ subject: null }));
    expect(caption).toContain("重要度:78");
    expect(caption).not.toContain("对象:");
  });
});

describe("buildMemoryContextSection(§6.5)", () => {
  it("组装 [相关经历] 段与 [关系印象] 段", () => {
    const section = buildMemoryContextSection([recalled({})], {
      agentId: "npc_lin_xia",
      summary: "与林夏相熟,上月因市集取消有过争执。",
    });
    expect(section).toContain("[相关经历]");
    expect(section).toContain("[与 npc_lin_xia 的关系印象]");
    expect(section).toContain("与林夏相熟,上月因市集取消有过争执。");
  });

  it("空召回显示占位行;关系摘要缺失用默认文案", () => {
    const empty = buildMemoryContextSection([], { agentId: "npc_shen_zhiheng", summary: null });
    expect(empty).toContain("(暂无相关经历)");
    expect(empty).toContain(NO_RELATION_TEXT);
  });

  it("未提供关系印象时不输出该段", () => {
    const section = buildMemoryContextSection([recalled({})]);
    expect(section).not.toContain("关系印象");
  });
});

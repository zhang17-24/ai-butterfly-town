import { describe, expect, it } from "vitest";
import { BUBBLE_MAX_CHARS, clipBubbleText } from "./bubbleText";

describe("clipBubbleText", () => {
  it("短文本原样返回,并去掉首尾空白", () => {
    expect(clipBubbleText("  照常办,我会盯着。  ")).toBe("照常办,我会盯着。");
  });

  it("恰好等于上限时不截断", () => {
    const text = "字".repeat(BUBBLE_MAX_CHARS);
    expect(clipBubbleText(text)).toBe(text);
  });

  it("超过上限时截断并加省略号", () => {
    const text = "字".repeat(BUBBLE_MAX_CHARS + 10);
    const clipped = clipBubbleText(text);
    expect(clipped).toBe(`${"字".repeat(BUBBLE_MAX_CHARS)}…`);
    expect(clipped.length).toBe(BUBBLE_MAX_CHARS + 1);
  });

  it("空串返回空串", () => {
    expect(clipBubbleText("")).toBe("");
  });
});

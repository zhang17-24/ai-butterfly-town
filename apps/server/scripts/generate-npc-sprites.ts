// 用豆包 Seedream 5.0 生成栖溪镇 NPC 精灵表。
// 运行（仓库根目录）：pnpm generate:sprites [npcId]
// 生成内容写入 apps/web/public/assets/npcs/。
import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { characterDesigns } from "./npc-designs.js";

loadEnv(path.resolve(process.cwd(), ".env"));

const API_KEY = process.env.AI_IMAGE_API_KEY ?? "";
const BASE_URL = process.env.AI_IMAGE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const MODEL = process.env.AI_IMAGE_MODEL ?? "doubao-seedream-5-0-260128";
const OUT_DIR = path.resolve(process.cwd(), "apps/web/public/assets/npcs");

const spritePrompt = (design: string) => `创建一张游戏角色精灵图（spritesheet）。角色：${design}。

布局必须是严格 6 列 × 5 行、每格等大的网格：
- 第 1 行（6 格）：角色向左走，动作姿态连贯形成行走循环
- 第 2 行（6 格）：角色面向屏幕向下走，连贯循环
- 第 3 行（6 格）：角色背对屏幕向上走，连贯循环
- 第 4 行：前 3 格分别为面向屏幕站立、背对屏幕站立、向左侧站立（静止待机），第 4-6 格留白
- 第 5 行：完全留白

硬性要求：
- 风格为简洁像素艺术（pixel art），Q 版头身比约 1:2，与参考图中的角色完全一致（外貌、发型、服装、配色、体型）
- 背景必须为纯绿色 #00B000 或相近纯绿，不要其他杂色背景
- 每帧人物大小一致，居中于所属格子，不裁切、不与相邻格重叠
- 不要文字、数字、网格线、水印、边框或道具说明
- 参考图仅为角色一致性锚点，动作布局请严格按上面的行语义绘制`;

async function generate(prompt: string, referenceB64: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    prompt,
    size: "2k",
    response_format: "b64_json",
    watermark: false,
  };
  if (referenceB64) body.image = [referenceB64];
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = (await response.json().catch(() => null)) as any;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw?.error?.message ?? JSON.stringify(raw).slice(0, 200)}`);
  const first = raw?.data?.[0];
  const b64 = first?.b64_json ?? first?.url ?? raw?.image;
  if (!b64) throw new Error(`空响应: ${JSON.stringify(raw).slice(0, 300)}`);
  if (b64.startsWith("http")) {
    const image = await fetch(b64).then((item) => item.arrayBuffer());
    return Buffer.from(image).toString("base64");
  }
  return b64;
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error("未配置 AI_IMAGE_API_KEY");
  await fs.mkdir(OUT_DIR, { recursive: true });
  const only = process.argv[2];
  const targets = only ? characterDesigns.filter((item) => item.id === only) : characterDesigns;
  if (only && targets.length === 0) throw new Error(`未知 NPC: ${only}`);

  for (const character of targets) {
    process.stdout.write(`[1/2] ${character.id} 角色设计图… `);
    const designB64 = await generate(character.design + "（请绘制全身站姿，正面，无背景/透明背景）", null);
    await fs.writeFile(path.join(OUT_DIR, `design-${character.id}.png`), Buffer.from(designB64, "base64"));
    process.stdout.write("保存 ✓；");
    process.stdout.write("[2/2] 6×5 精灵表… ");
    const sheetB64 = await generate(spritePrompt(character.design), `data:image/png;base64,${designB64}`);
    await fs.writeFile(path.join(OUT_DIR, `${character.id}.png`), Buffer.from(sheetB64, "base64"));
    process.stdout.write("保存 ✓\n");
  }
  console.log(`全部完成 → ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(`\n生成失败: ${error.message}`);
  process.exitCode = 1;
});

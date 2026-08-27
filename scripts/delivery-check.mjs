#!/usr/bin/env node
// 一键交付检查:执行类型检查、离线测试与生产构建,再输出人工确认清单。
// 只依赖 Node 内置模块;不触碰任何 server/web 运行时文件。
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: "inherit" });

console.log("== AI 蝴蝶小镇 交付检查 ==");
console.log("步骤 1/2: pnpm verify (typecheck + offline tests + build)\n");

const verify = run("pnpm", ["verify"]);
if (verify.status !== 0) {
  console.error("\n[FAIL] pnpm verify 未通过,请先修复后重试。");
  process.exit(verify.status ?? 1);
}

console.log("\n步骤 2/2: 人工确认清单(交付前逐项核对)\n");
const checklist = [
  "线上 URL 可用,并标注演示账号与预计有效期(见 docs/delivery.md)",
  "演示账号(默认 demo)与 AI 密钥位于 apps/server/.env(不入库)",
  "README 5 分钟 Quick Start 可一次跑通",
  "Docker 单服务可启动:docker compose up --build 后访问 :3100(共享库 dist 导出已修复)",
  "OpenAPI 自动生成已接入:GET /api/openapi.json",
  "真实 AI 契约:pnpm test:ai(chat 决策/对话+Seedream 生图,本地已验证 3/3)",
  "E2E 冒烟:pnpm test:e2e(10/10)",
  "5 分钟演示视频已录制(脚本见 docs/delivery.md)",
];
for (const [index, item] of checklist.entries()) {
  console.log(`  ${index + 1}. [ ] ${item}`);
}

console.log("\n[PASS] 自动检查通过。完成上述人工确认后即可交付。");

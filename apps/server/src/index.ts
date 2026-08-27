import "dotenv/config";
import { buildApp } from "./app.js";

const { app, config } = await buildApp();
await app.listen({ host: "0.0.0.0", port: config.port });
console.log(`[AI Town] API: http://localhost:${config.port}`);
console.log(`[AI Town] Demo account: ${config.demoUsername}`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

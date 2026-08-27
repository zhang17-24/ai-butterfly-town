import path from "node:path";

export interface AppConfig {
  port: number;
  webOrigin: string;
  databasePath: string;
  cookieSecret: string;
  demoUsername: string;
  demoPassword: string;
  tickMs: number;
  serveWeb: boolean;
  simulationAi: {
    apiKey: string;
    baseUrl: string;
    model: string;
    apiStyle: "responses" | "chat";
    chatPath?: string;
    timeoutMs: number;
    maxOutputTokens: number;
    maxConcurrency: number;
    maxDecisionsPerTick: number;
  };
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3100),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3200",
    databasePath: process.env.DATABASE_PATH ?? path.resolve("data/ai-town.db"),
    cookieSecret: process.env.COOKIE_SECRET ?? "development-only-cookie-secret-change-me",
    demoUsername: process.env.DEMO_USERNAME ?? "demo",
    demoPassword: process.env.DEMO_PASSWORD ?? "town1234",
    tickMs: Number(process.env.SIMULATION_TICK_MS ?? 2000),
    serveWeb: process.env.SERVE_WEB === "1",
    simulationAi: {
      apiKey: process.env.AI_SIMULATION_API_KEY ?? "",
      baseUrl: process.env.AI_SIMULATION_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.AI_SIMULATION_MODEL ?? "",
      apiStyle: process.env.AI_SIMULATION_API_STYLE === "chat" ? "chat" : "responses",
      chatPath: process.env.AI_SIMULATION_CHAT_PATH ?? "/chat/completions",
      timeoutMs: Number(process.env.AI_SIMULATION_TIMEOUT_MS ?? 2500),
      maxOutputTokens: Number(process.env.AI_SIMULATION_MAX_OUTPUT_TOKENS ?? 180),
      maxConcurrency: Number(process.env.AI_SIMULATION_MAX_CONCURRENCY ?? 2),
      maxDecisionsPerTick: Number(process.env.AI_SIMULATION_MAX_DECISIONS_PER_TICK ?? 2),
    },
    ...overrides,
  };
}

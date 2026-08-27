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
    ...overrides,
  };
}


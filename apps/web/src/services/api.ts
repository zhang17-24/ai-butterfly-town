import { WorldStateSchema, WorldSummarySchema, type WorldState, type WorldSummary } from "@ai-town/shared";

class ApiRequestError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly details: Record<string, unknown> | undefined) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    throw new ApiRequestError(message ?? `请求失败 (${response.status})`, body.error?.code, body.error?.details);
  }
  return body as T;
}

export const api = {
  login: (username: string, password: string) => request<{ id: string; username: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; username: string }>("/auth/me"),
  async worlds(): Promise<WorldSummary[]> {
    return WorldSummarySchema.array().parse(await request<unknown>("/worlds"));
  },
  async worldState(worldId: string): Promise<WorldState> {
    return WorldStateSchema.parse(await request<unknown>(`/worlds/${worldId}/state`));
  },
  async setPaused(worldId: string, paused: boolean, expectedVersion: number): Promise<WorldSummary> {
    const commit = (version: number) => request<unknown>(`/worlds/${worldId}/pause`, {
      method: "POST",
      body: JSON.stringify({ paused, expectedVersion: version, idempotencyKey: crypto.randomUUID() }),
    });
    try {
      return WorldSummarySchema.parse(await commit(expectedVersion));
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "WORLD_VERSION_CONFLICT") throw error;
      const latest = WorldStateSchema.parse(await request<unknown>(`/worlds/${worldId}/state`));
      return WorldSummarySchema.parse(await commit(latest.world.version));
    }
  },
};

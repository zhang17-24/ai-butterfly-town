import { WorldStateSchema, WorldSummarySchema, type WorldState, type WorldSummary } from "@ai-town/shared";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `请求失败 (${response.status})`);
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
  async setPaused(worldId: string, paused: boolean): Promise<WorldSummary> {
    return WorldSummarySchema.parse(await request<unknown>(`/worlds/${worldId}/pause`, {
      method: "POST",
      body: JSON.stringify({ paused }),
    }));
  },
};


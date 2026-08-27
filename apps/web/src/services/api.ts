import { AiTraceSchema, CausalGraphSchema, DialogueEndResultSchema, DialogueReplyResultSchema, DialogueSessionSchema, DialogueStartResultSchema, EventCommitResultSchema, EventPreviewResultSchema, PlayerMoveResultSchema, TownEventSchema, WorldStateSchema, WorldSummarySchema, type AiTrace, type CausalGraph, type DialogueEndResult, type DialogueReplyResult, type DialogueSession, type DialogueStartResult, type EventCommitResult, type EventPreviewResult, type EventPreviewSpec, type PlayerMoveResult, type Position, type TownEvent, type WorldState, type WorldSummary } from "@ai-town/shared";

class ApiRequestError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly details: Record<string, unknown> | undefined) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (typeof options.body === "string") headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers,
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
  async aiTraces(worldId: string, agentId: string): Promise<AiTrace[]> {
    return AiTraceSchema.array().parse(await request<unknown>(`/worlds/${worldId}/agents/${agentId}/decisions?limit=8`));
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
  async movePlayer(worldId: string, target: Position, expectedVersion: number): Promise<PlayerMoveResult> {
    const idempotencyKey = crypto.randomUUID();
    const commit = (version: number) => request<unknown>(`/worlds/${worldId}/player/move`, {
      method: "POST",
      body: JSON.stringify({ target, expectedVersion: version, idempotencyKey }),
    });
    try {
      return PlayerMoveResultSchema.parse(await commit(expectedVersion));
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "WORLD_VERSION_CONFLICT") throw error;
      const latest = WorldStateSchema.parse(await request<unknown>(`/worlds/${worldId}/state`));
      return PlayerMoveResultSchema.parse(await commit(latest.world.version));
    }
  },
  async startDialogue(worldId: string, npcId: string, expectedVersion: number): Promise<DialogueStartResult> {
    const idempotencyKey = crypto.randomUUID();
    const commit = (version: number) => request<unknown>(`/worlds/${worldId}/dialogues/start`, {
      method: "POST", body: JSON.stringify({ npcId, expectedVersion: version, idempotencyKey }),
    });
    try {
      return DialogueStartResultSchema.parse(await commit(expectedVersion));
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "WORLD_VERSION_CONFLICT") throw error;
      const latest = WorldStateSchema.parse(await request<unknown>(`/worlds/${worldId}/state`));
      return DialogueStartResultSchema.parse(await commit(latest.world.version));
    }
  },
  async activeDialogue(worldId: string): Promise<DialogueSession | null> {
    const result = await request<unknown>(`/worlds/${worldId}/dialogues/active`);
    return result === null ? null : DialogueSessionSchema.parse(result);
  },
  async sendDialogueMessage(sessionId: string, content: string): Promise<DialogueReplyResult> {
    return DialogueReplyResultSchema.parse(await request<unknown>(`/dialogues/${sessionId}/messages`, { method: "POST", body: JSON.stringify({ content }) }));
  },
  async endDialogue(sessionId: string): Promise<DialogueEndResult> {
    return DialogueEndResultSchema.parse(await request<unknown>(`/dialogues/${sessionId}/end`, { method: "POST" }));
  },
  async previewEvent(worldId: string, text: string): Promise<EventPreviewResult> {
    return EventPreviewResultSchema.parse(await request<unknown>(`/worlds/${worldId}/events/preview`, { method: "POST", body: JSON.stringify({ text }) }));
  },
  async commitEvent(worldId: string, preview: EventPreviewSpec, expectedVersion: number): Promise<EventCommitResult> {
    const idempotencyKey = crypto.randomUUID();
    const commit = (version: number) => request<unknown>(`/worlds/${worldId}/events/commit`, {
      method: "POST", body: JSON.stringify({ preview, expectedVersion: version, idempotencyKey }),
    });
    try {
      return EventCommitResultSchema.parse(await commit(expectedVersion));
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "WORLD_VERSION_CONFLICT") throw error;
      const latest = WorldStateSchema.parse(await request<unknown>(`/worlds/${worldId}/state`));
      return EventCommitResultSchema.parse(await commit(latest.world.version));
    }
  },
  async timeline(worldId: string, afterVersion = 0): Promise<TownEvent[]> {
    return TownEventSchema.array().parse(await request<unknown>(`/worlds/${worldId}/timeline?afterVersion=${afterVersion}&limit=100`));
  },
  async causalGraph(worldId: string): Promise<CausalGraph> {
    return CausalGraphSchema.parse(await request<unknown>(`/worlds/${worldId}/causal`));
  },
};

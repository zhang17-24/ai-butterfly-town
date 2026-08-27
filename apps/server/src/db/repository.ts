import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import type { AiTrace, CausalGraph, DialogueEndResult, DialogueMessage, DialogueReplyResult, DialogueSession, DialogueStartResult, EventCommitResult, EventPreviewSpec, Job, MemoryEntry, Npc, NpcProfile, NpcState, Player, PlayerMoveResult, Position, RecalledMemory, TownEvent, WorldBlueprint, WorldState, WorldSummary } from "@ai-town/shared";
import { AiTraceSchema, DialogueSessionSchema, NpcProfileSchema, NpcStateSchema, PlayerSchema } from "@ai-town/shared";
import type { DatabaseHandle } from "./database.js";
import { aiTraces, commandReceipts, dialogueMessages, dialogueSessions, events, jobs, knowledge, memories, npcs, players, relationships, snapshots, users, worldBranches, worlds } from "./schema.js";
import { computeKnowledgeSpread, type CausalEventSpec } from "../domain/event-propagation.js";
import { demoNpcs, demoWorld, DEMO_USER_ID } from "../domain/seed.js";
import { qixiBlueprint } from "../generation/qixi-blueprint.js";
import { createNavigationGrid, findApproachPath, findPath } from "../navigation/a-star.js";
import { computeSnapshotChecksum, shouldSnapshot } from "../timeline/snapshot-logic.js";
import { computeMemoryImportance, type ImportanceInput } from "../memory/importance.js";
import { retrieveMemories, type MemoryEntryView } from "../memory/retrieval.js";
import type { WorldPackage } from "../generation/world-structure.js";

export const eventSourceValues = ["system", "player", "ai", "mock"] as const;
type EventSource = (typeof eventSourceValues)[number];

function clip(value: string, max = 80): string {
  return value.trim().slice(0, max);
}

export type PendingWorldEvent = Omit<TownEvent, "id" | "branchId" | "version" | "createdAt" | "schemaVersion" | "source" | "causeIds"> & {
  source?: EventSource;
  causeIds?: string[];
};

export interface MemoryWriteRow {
  worldId: string;
  agentId: string;
  kind: "dialogue" | "event" | "action" | "summary" | "insight";
  content: string;
  importance: number;
  subject: string | null;
  worldMinute: number;
  sourceIdentifier: string;
  metadataJson: string;
}

export type PauseCommandResult =
  | { kind: "ok"; world: WorldSummary; event: TownEvent | null; replayed: boolean }
  | { kind: "not_found" }
  | { kind: "idempotency_conflict" }
  | { kind: "version_conflict"; currentVersion: number };

export type MovePlayerCommandResult =
  | { kind: "ok"; result: PlayerMoveResult }
  | { kind: "not_found" }
  | { kind: "unreachable" }
  | { kind: "idempotency_conflict" }
  | { kind: "version_conflict"; currentVersion: number };

export type StartDialogueCommandResult =
  | { kind: "ok"; result: DialogueStartResult; replayed: boolean }
  | { kind: "not_found" }
  | { kind: "busy" }
  | { kind: "unreachable" }
  | { kind: "version_conflict"; currentVersion: number };

export type EventCommitCommandResult =
  | { kind: "ok"; result: EventCommitResult }
  | { kind: "not_found" }
  | { kind: "idempotency_conflict" }
  | { kind: "version_conflict"; currentVersion: number };

export interface WorldRepository {
  listWorlds(userId: string): WorldSummary[];
  getWorldState(userId: string, worldId: string): WorldState | null;
  ownsWorld(userId: string, worldId: string): boolean;
}

export interface EventRepository {
  listEventsAfter(worldId: string, branchId: string, afterVersion: number, limit: number): TownEvent[];
}

export interface AgentRepository {
  getSimulationState(worldId: string): { world: WorldSummary; npcs: Npc[] } | null;
}

export class TownRepository implements WorldRepository, EventRepository, AgentRepository {
  constructor(private handle: DatabaseHandle) {}

  get raw() {
    return this.handle.sqlite;
  }

  seedDemo(username: string, passwordHash: string): void {
    const now = new Date().toISOString();
    this.handle.db.insert(users).values({ id: DEMO_USER_ID, username, passwordHash, createdAt: now }).onConflictDoNothing().run();
    this.handle.db.insert(worlds).values({
      id: demoWorld.id,
      userId: DEMO_USER_ID,
      name: demoWorld.name,
      description: demoWorld.description,
      gameMinute: 500,
      version: 1,
      paused: false,
      updatedAt: now,
    }).onConflictDoNothing().run();
    for (const npc of demoNpcs) {
      this.handle.db.insert(npcs).values({
        id: npc.profile.id,
        worldId: demoWorld.id,
        profileJson: JSON.stringify(npc.profile),
        stateJson: JSON.stringify(npc.state),
        updatedAt: now,
      }).onConflictDoNothing().run();
    }
    this.handle.db.insert(players).values({
      id: `player_${DEMO_USER_ID}_${demoWorld.id}`,
      worldId: demoWorld.id,
      userId: DEMO_USER_ID,
      name: "你",
      positionJson: JSON.stringify(qixiBlueprint.spawnPoints.find((item) => item.id === "player")?.position ?? { x: 520, y: 350 }),
      updatedAt: now,
    }).onConflictDoNothing().run();
    for (const world of this.handle.db.select({ id: worlds.id }).from(worlds).all()) this.ensureWorldFoundation(world.id);
  }

  findUserByUsername(username: string) {
    return this.handle.db.select().from(users).where(eq(users.username, username)).get();
  }

  findUserById(id: string) {
    return this.handle.db.select().from(users).where(eq(users.id, id)).get();
  }

  listWorlds(userId: string): WorldSummary[] {
    return this.handle.db.select().from(worlds).where(eq(worlds.userId, userId)).all().map((world) => ({
      id: world.id,
      name: world.name,
      description: world.description,
      gameMinute: world.gameMinute,
      version: world.version,
      paused: world.paused,
      activeBranchId: world.activeBranchId ?? this.mainBranchId(world.id),
      npcCount: this.handle.db.select().from(npcs).where(eq(npcs.worldId, world.id)).all().length,
    }));
  }

  ownsWorld(userId: string, worldId: string): boolean {
    return !!this.handle.db.select({ id: worlds.id }).from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
  }

  getWorldState(userId: string, worldId: string): WorldState | null {
    const world = this.handle.db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
    if (!world) return null;
    const branchId = world.activeBranchId ?? this.mainBranchId(world.id);
    const npcRows = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldId)).all();
    const player = this.getPlayer(userId, worldId);
    if (!player) return null;
    const eventRows = this.handle.db.select().from(events).where(and(eq(events.worldId, worldId), eq(events.branchId, branchId))).orderBy(desc(events.version)).limit(24).all();
    return {
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        gameMinute: world.gameMinute,
        version: world.version,
        paused: world.paused,
        activeBranchId: branchId,
        npcCount: npcRows.length,
      },
      player,
      npcs: npcRows.map((row) => ({
        profile: NpcProfileSchema.parse(JSON.parse(row.profileJson)) as NpcProfile,
        state: NpcStateSchema.parse(JSON.parse(row.stateJson)) as NpcState,
      })),
      recentEvents: eventRows.reverse().map((row) => this.toEvent(row)),
    };
  }

  listActiveWorldIds(): string[] {
    return this.handle.db.select({ id: worlds.id }).from(worlds).where(eq(worlds.paused, false)).all().map((row) => row.id);
  }

  setPaused(worldId: string, paused: boolean): void {
    this.handle.db.update(worlds).set({ paused, updatedAt: new Date().toISOString() }).where(eq(worlds.id, worldId)).run();
  }

  getSimulationState(worldId: string): { world: WorldSummary; npcs: Npc[] } | null {
    const world = this.handle.db.select().from(worlds).where(eq(worlds.id, worldId)).get();
    if (!world) return null;
    const npcRows = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldId)).all();
    return {
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        gameMinute: world.gameMinute,
        version: world.version,
        paused: world.paused,
        activeBranchId: world.activeBranchId ?? this.mainBranchId(world.id),
        npcCount: npcRows.length,
      },
      npcs: npcRows.map((row) => ({ profile: JSON.parse(row.profileJson), state: JSON.parse(row.stateJson) })),
    };
  }

  commitTick(worldId: string, expectedVersion: number, gameMinute: number, updatedNpcs: Npc[], newEvents: PendingWorldEvent[], newTraces: AiTrace[] = [], newMemories: MemoryWriteRow[] = []): { world: WorldSummary; events: TownEvent[]; snapshot: { id: string; reason: string } | null } | null {
    const now = new Date().toISOString();
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(eq(worlds.id, worldId)).get();
      if (!current || current.version !== expectedVersion) return null;
      const branchId = current.activeBranchId ?? this.mainBranchId(worldId);
      const version = expectedVersion + 1;
      const committed = newEvents.map((event): TownEvent => ({
        ...event,
        id: randomUUID(),
        branchId,
        version,
        source: event.source ?? "system",
        causeIds: event.causeIds ?? [],
        schemaVersion: 1,
        createdAt: now,
      }));
      this.handle.db.update(worlds).set({ gameMinute, version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, worldId)).run();
      for (const npc of updatedNpcs) {
        this.handle.db.update(npcs).set({ stateJson: JSON.stringify(npc.state), updatedAt: now }).where(eq(npcs.id, npc.profile.id)).run();
      }
      for (const event of committed) {
        this.handle.db.insert(events).values({
          id: event.id,
          worldId: event.worldId,
          branchId: event.branchId,
          version: event.version,
          gameMinute: event.gameMinute,
          type: event.type,
          actorId: event.actorId,
          summary: event.summary,
          source: event.source,
          causeIdsJson: JSON.stringify(event.causeIds),
          schemaVersion: event.schemaVersion,
          payloadJson: JSON.stringify(event.payload),
          createdAt: event.createdAt,
        }).run();
      }
      for (const trace of newTraces) {
        this.handle.db.insert(aiTraces).values({
          id: trace.id,
          worldId: trace.worldId,
          branchId: trace.branchId,
          agentId: trace.agentId,
          role: trace.role,
          status: trace.status,
          traceJson: JSON.stringify(trace),
          createdAt: trace.createdAt,
        }).run();
      }
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      for (const memory of newMemories) this.writeMemory(memory, now);
      const summary = this.toWorldSummary({ ...current, gameMinute, version, activeBranchId: branchId }, updatedNpcs.length);
      const headerEvent = committed.at(-1);
      const headerEventType = headerEvent?.type ?? "";
      const snapshot = this.maybeWriteSnapshot(worldId, branchId, version, gameMinute, headerEventType, summary, updatedNpcs, now);
      return {
        world: summary,
        events: committed,
        snapshot,
      };
    })();
  }

  executePauseCommand(input: { userId: string; worldId: string; paused: boolean; expectedVersion?: number; idempotencyKey?: string }): PauseCommandResult {
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(and(eq(worlds.id, input.worldId), eq(worlds.userId, input.userId))).get();
      if (!current) return { kind: "not_found" } as const;

      if (input.idempotencyKey) {
        const receipt = this.handle.db.select().from(commandReceipts).where(eq(commandReceipts.idempotencyKey, input.idempotencyKey)).get();
        if (receipt) {
          const previous = JSON.parse(receipt.responseJson) as WorldSummary;
          if (receipt.worldId !== input.worldId || receipt.commandType !== "world.pause" || previous.paused !== input.paused) {
            return { kind: "idempotency_conflict" } as const;
          }
          return { kind: "ok", world: previous, event: null, replayed: true } as const;
        }
      }

      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
        return { kind: "version_conflict", currentVersion: current.version } as const;
      }

      const now = new Date().toISOString();
      const version = current.version + 1;
      const branchId = current.activeBranchId ?? this.mainBranchId(current.id);
      const event: TownEvent = {
        id: randomUUID(),
        worldId: current.id,
        branchId,
        version,
        gameMinute: current.gameMinute,
        type: input.paused ? "world.paused" : "world.resumed",
        actorId: null,
        summary: input.paused ? "世界已暂停" : "世界已继续运行",
        source: "player",
        causeIds: [],
        schemaVersion: 1,
        payload: { paused: input.paused },
        createdAt: now,
      };
      this.handle.db.update(worlds).set({ paused: input.paused, version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, current.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, current.id)).all().length;
      const world = this.toWorldSummary({ ...current, paused: input.paused, version, activeBranchId: branchId }, npcCount);
      if (input.idempotencyKey) {
        this.handle.db.insert(commandReceipts).values({
          idempotencyKey: input.idempotencyKey,
          worldId: current.id,
          commandType: "world.pause",
          baseVersion: input.expectedVersion ?? current.version,
          committedVersion: version,
          responseJson: JSON.stringify(world),
          createdAt: now,
        }).run();
      }
      return { kind: "ok", world, event, replayed: false } as const;
    })();
  }

  executeMovePlayerCommand(input: { userId: string; worldId: string; target: Position; expectedVersion: number; idempotencyKey: string }): MovePlayerCommandResult {
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(and(eq(worlds.id, input.worldId), eq(worlds.userId, input.userId))).get();
      if (!current) return { kind: "not_found" } as const;
      const receipt = this.handle.db.select().from(commandReceipts).where(eq(commandReceipts.idempotencyKey, input.idempotencyKey)).get();
      if (receipt) {
        if (receipt.worldId !== input.worldId || receipt.commandType !== "player.move") return { kind: "idempotency_conflict" } as const;
        return { kind: "ok", result: { ...(JSON.parse(receipt.responseJson) as PlayerMoveResult), replayed: true } } as const;
      }
      if (current.version !== input.expectedVersion) return { kind: "version_conflict", currentVersion: current.version } as const;
      const playerRow = this.handle.db.select().from(players).where(and(eq(players.worldId, input.worldId), eq(players.userId, input.userId))).get();
      if (!playerRow) return { kind: "not_found" } as const;
      const player = this.toPlayer(playerRow);
      const path = findPath(createNavigationGrid(qixiBlueprint), player.position, input.target);
      if (!path) return { kind: "unreachable" } as const;

      const now = new Date().toISOString();
      const version = current.version + 1;
      const branchId = current.activeBranchId ?? this.mainBranchId(current.id);
      const movedPlayer: Player = { ...player, position: input.target };
      const event: TownEvent = {
        id: randomUUID(), worldId: current.id, branchId, version, gameMinute: current.gameMinute,
        type: "player.moved", actorId: player.id, summary: "你移动到了新的位置", source: "player",
        causeIds: [], schemaVersion: 1, payload: { from: player.position, to: input.target, path }, createdAt: now,
      };
      this.handle.db.update(players).set({ positionJson: JSON.stringify(input.target), updatedAt: now }).where(eq(players.id, player.id)).run();
      this.handle.db.update(worlds).set({ version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, current.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, current.id)).all().length;
      const world = this.toWorldSummary({ ...current, version, activeBranchId: branchId }, npcCount);
      const result: PlayerMoveResult = { player: movedPlayer, path, world, event, replayed: false };
      this.handle.db.insert(commandReceipts).values({
        idempotencyKey: input.idempotencyKey, worldId: current.id, commandType: "player.move",
        baseVersion: input.expectedVersion, committedVersion: version, responseJson: JSON.stringify(result), createdAt: now,
      }).run();
      return { kind: "ok", result } as const;
    })();
  }

  executeStartDialogueCommand(input: { userId: string; worldId: string; npcId: string; expectedVersion: number; idempotencyKey: string }): StartDialogueCommandResult {
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(and(eq(worlds.id, input.worldId), eq(worlds.userId, input.userId))).get();
      if (!current) return { kind: "not_found" } as const;
      const receipt = this.handle.db.select().from(commandReceipts).where(eq(commandReceipts.idempotencyKey, input.idempotencyKey)).get();
      if (receipt?.commandType === "dialogue.start" && receipt.worldId === input.worldId) {
        return { kind: "ok", result: JSON.parse(receipt.responseJson) as DialogueStartResult, replayed: true } as const;
      }
      if (current.version !== input.expectedVersion) return { kind: "version_conflict", currentVersion: current.version } as const;
      const playerRow = this.handle.db.select().from(players).where(and(eq(players.worldId, input.worldId), eq(players.userId, input.userId))).get();
      const npcRow = this.handle.db.select().from(npcs).where(and(eq(npcs.worldId, input.worldId), eq(npcs.id, input.npcId))).get();
      if (!playerRow || !npcRow) return { kind: "not_found" } as const;
      const active = this.handle.db.select().from(dialogueSessions).where(and(eq(dialogueSessions.playerId, playerRow.id), eq(dialogueSessions.status, "active"))).get();
      if (active) return { kind: "busy" } as const;
      const player = this.toPlayer(playerRow);
      const npc: Npc = { profile: NpcProfileSchema.parse(JSON.parse(npcRow.profileJson)), state: NpcStateSchema.parse(JSON.parse(npcRow.stateJson)) };
      const approach = findApproachPath(createNavigationGrid(qixiBlueprint), player.position, npc.state.position);
      if (!approach) return { kind: "unreachable" } as const;

      const now = new Date().toISOString();
      const version = current.version + 1;
      const branchId = current.activeBranchId ?? this.mainBranchId(current.id);
      const movedPlayer: Player = { ...player, position: approach.destination };
      const talkingNpc: Npc = { ...npc, state: { ...npc.state, currentAction: "与你交谈", actionReason: "玩家来到身边并开始交谈。", actionEndsAtMinute: current.gameMinute + 30 } };
      const session: DialogueSession = { id: randomUUID(), worldId: current.id, playerId: player.id, npcId: npc.profile.id, status: "active", startedAt: now, endedAt: null, messages: [] };
      const event: TownEvent = {
        id: randomUUID(), worldId: current.id, branchId, version, gameMinute: current.gameMinute,
        type: "dialogue.started", actorId: player.id, summary: `你走近${npc.profile.name}并开始交谈`, source: "player",
        causeIds: [], schemaVersion: 1, payload: { sessionId: session.id, npcId: npc.profile.id, path: approach.path }, createdAt: now,
      };
      this.handle.db.update(players).set({ positionJson: JSON.stringify(approach.destination), updatedAt: now }).where(eq(players.id, player.id)).run();
      this.handle.db.update(npcs).set({ stateJson: JSON.stringify(talkingNpc.state), updatedAt: now }).where(eq(npcs.id, npc.profile.id)).run();
      this.handle.db.insert(dialogueSessions).values({ id: session.id, worldId: session.worldId, playerId: session.playerId, npcId: session.npcId, status: session.status, startedAt: now, endedAt: null }).run();
      this.handle.db.update(worlds).set({ version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, current.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, current.id)).all().length;
      const result: DialogueStartResult = { session, player: movedPlayer, npc: talkingNpc, path: approach.path, world: this.toWorldSummary({ ...current, version, activeBranchId: branchId }, npcCount), event };
      this.handle.db.insert(commandReceipts).values({ idempotencyKey: input.idempotencyKey, worldId: current.id, commandType: "dialogue.start", baseVersion: input.expectedVersion, committedVersion: version, responseJson: JSON.stringify(result), createdAt: now }).run();
      return { kind: "ok", result, replayed: false } as const;
    })();
  }

  dialogueContext(userId: string, sessionId: string): { npc: Npc; player: Player; world: WorldSummary; relationshipSummary: string | null; recentMemories: string[] } | null {
    const sessionRow = this.handle.db.select().from(dialogueSessions).where(and(eq(dialogueSessions.id, sessionId), eq(dialogueSessions.status, "active"))).get();
    if (!sessionRow) return null;
    const playerRow = this.handle.db.select().from(players).where(and(eq(players.id, sessionRow.playerId), eq(players.userId, userId))).get();
    const npcRow = this.handle.db.select().from(npcs).where(eq(npcs.id, sessionRow.npcId)).get();
    const worldRow = this.handle.db.select().from(worlds).where(eq(worlds.id, sessionRow.worldId)).get();
    if (!playerRow || !npcRow || !worldRow) return null;
    const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldRow.id)).all().length;
    const relation = this.handle.db.select().from(relationships).where(eq(relationships.id, `rel_${worldRow.id}_${npcRow.id}_${playerRow.id}`)).get();
    const relationshipSummary = relation ? (JSON.parse(relation.stateJson) as { summary?: string }).summary ?? null : null;
    const recentMemories = this.handle.db
      .select({ content: memories.content })
      .from(memories)
      .where(and(eq(memories.worldId, worldRow.id), eq(memories.agentId, npcRow.id)))
      .orderBy(desc(memories.createdAt))
      .limit(5)
      .all()
      .map((row) => row.content);
    return {
      npc: { profile: NpcProfileSchema.parse(JSON.parse(npcRow.profileJson)), state: NpcStateSchema.parse(JSON.parse(npcRow.stateJson)) },
      player: this.toPlayer(playerRow),
      world: this.toWorldSummary(worldRow, npcCount),
      relationshipSummary,
      recentMemories,
    };
  }

  sendDialogueMessage(input: { userId: string; sessionId: string; content: string; memory?: string | null; reply: { content: string; source: "ai" | "mock" }; trace?: AiTrace | null }): DialogueReplyResult | null {
    return this.handle.sqlite.transaction(() => {
      const sessionRow = this.handle.db.select().from(dialogueSessions).where(and(eq(dialogueSessions.id, input.sessionId), eq(dialogueSessions.status, "active"))).get();
      if (!sessionRow) return null;
      const playerRow = this.handle.db.select().from(players).where(and(eq(players.id, sessionRow.playerId), eq(players.userId, input.userId))).get();
      const npcRow = this.handle.db.select().from(npcs).where(eq(npcs.id, sessionRow.npcId)).get();
      const worldRow = this.handle.db.select().from(worlds).where(eq(worlds.id, sessionRow.worldId)).get();
      if (!playerRow || !npcRow || !worldRow) return null;
      const npc: Npc = { profile: NpcProfileSchema.parse(JSON.parse(npcRow.profileJson)), state: NpcStateSchema.parse(JSON.parse(npcRow.stateJson)) };
      const now = new Date().toISOString();
      const version = worldRow.version + 1;
      const branchId = worldRow.activeBranchId ?? this.mainBranchId(worldRow.id);
      const playerMessage: DialogueMessage = { id: randomUUID(), sessionId: sessionRow.id, speakerId: playerRow.id, content: input.content.trim(), source: "player", createdAt: now };
      const reply: DialogueMessage = { id: randomUUID(), sessionId: sessionRow.id, speakerId: npc.profile.id, content: input.reply.content, source: input.reply.source, createdAt: new Date(Date.now() + 1).toISOString() };
      for (const message of [playerMessage, reply]) this.handle.db.insert(dialogueMessages).values(message).run();
      const memoryContent = input.memory?.trim() || `玩家说：“${input.content.trim()}”`;
      const tone = /暴雨|取消|事故|受伤|发烧|难受|难过|糟糕|停电|晚了/.test(input.content) ? "negative" as const : /开心|谢谢|太好了|喜欢|欢迎/.test(input.content) ? "positive" as const : "neutral" as const;
      const importance = computeMemoryImportance({
        kind: "dialogue", tone,
        stateExtreme: Object.values({ hunger: npc.state.hunger, energy: npc.state.energy, mood: npc.state.mood, stress: npc.state.stress, social: npc.state.social }).some((v) => v < 20 || v > 85),
      });
      this.writeMemory({
        worldId: sessionRow.worldId, agentId: npc.profile.id, kind: "dialogue", content: memoryContent,
        importance, subject: playerRow.id, worldMinute: worldRow.gameMinute,
        sourceIdentifier: `dialogue:${sessionRow.worldId}:${npc.profile.id}:${sessionRow.id}:${playerMessage.id}`,
        metadataJson: JSON.stringify({ sessionId: sessionRow.id, counterpartNpcId: playerRow.id, tone, source: "player" }),
      }, now);
      const relationId = `rel_${sessionRow.worldId}_${npc.profile.id}_${playerRow.id}`;
      const existing = this.handle.db.select().from(relationships).where(eq(relationships.id, relationId)).get();
      const previous = existing ? JSON.parse(existing.stateJson) as { familiarity?: number; liking?: number; trust?: number; respect?: number; summary?: string } : {};
      const relation = {
        familiarity: Math.min(100, (previous.familiarity ?? 5) + 2), liking: previous.liking ?? 50,
        trust: Math.min(100, (previous.trust ?? 45) + 1), respect: previous.respect ?? 50,
        labels: ["见过的居民"], summary: `最近与玩家谈到：${input.content.trim().slice(0, 60)}`,
      };
      if (existing) this.handle.db.update(relationships).set({ stateJson: JSON.stringify(relation), updatedAt: now }).where(eq(relationships.id, relationId)).run();
      else this.handle.db.insert(relationships).values({ id: relationId, worldId: sessionRow.worldId, sourceAgentId: npc.profile.id, targetAgentId: playerRow.id, stateJson: JSON.stringify(relation), updatedAt: now }).run();
      const event: TownEvent = {
        id: randomUUID(), worldId: worldRow.id, branchId, version, gameMinute: worldRow.gameMinute,
        type: "dialogue.message", actorId: playerRow.id,
        summary: `${npc.profile.name}回应你：${clip(input.reply.content)}`,
        source: input.reply.source, causeIds: [], schemaVersion: 1,
        payload: { sessionId: sessionRow.id, npcId: npc.profile.id, message: clip(input.content), reply: clip(input.reply.content), replySource: input.reply.source },
        createdAt: now,
      };
      this.handle.db.update(worlds).set({ version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, worldRow.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      if (input.trace) {
        this.handle.db.insert(aiTraces).values({
          id: input.trace.id, worldId: input.trace.worldId, branchId: input.trace.branchId,
          agentId: input.trace.agentId, role: input.trace.role, status: input.trace.status,
          traceJson: JSON.stringify(input.trace), createdAt: input.trace.createdAt,
        }).run();
      }
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldRow.id)).all().length;
      return {
        session: this.getDialogueSession(sessionRow.id)!,
        reply,
        world: this.toWorldSummary({ ...worldRow, version, activeBranchId: branchId }, npcCount),
        event,
      };
    })();
  }

  getActiveDialogue(userId: string, worldId: string): DialogueSession | null {
    const player = this.handle.db.select().from(players).where(and(eq(players.userId, userId), eq(players.worldId, worldId))).get();
    if (!player) return null;
    const session = this.handle.db.select().from(dialogueSessions).where(and(eq(dialogueSessions.playerId, player.id), eq(dialogueSessions.status, "active"))).orderBy(desc(dialogueSessions.startedAt)).get();
    return session ? this.getDialogueSession(session.id) : null;
  }

  executeEventCommitCommand(input: { userId: string; worldId: string; preview: EventPreviewSpec; expectedVersion: number; idempotencyKey: string }): EventCommitCommandResult {
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(and(eq(worlds.id, input.worldId), eq(worlds.userId, input.userId))).get();
      if (!current) return { kind: "not_found" } as const;
      const receipt = this.handle.db.select().from(commandReceipts).where(eq(commandReceipts.idempotencyKey, input.idempotencyKey)).get();
      if (receipt && receipt.commandType !== "event.commit") return { kind: "idempotency_conflict" } as const;
      if (receipt && receipt.commandType === "event.commit" && receipt.worldId === input.worldId) {
        return { kind: "ok", result: JSON.parse(receipt.responseJson) as EventCommitResult } as const;
      }
      if (receipt && receipt.worldId !== input.worldId) return { kind: "idempotency_conflict" } as const;
      if (current.version !== input.expectedVersion) return { kind: "version_conflict", currentVersion: current.version } as const;
      const npcRows = this.handle.db.select().from(npcs).where(eq(npcs.worldId, input.worldId)).all();
      const playerRow = this.handle.db.select().from(players).where(eq(players.worldId, input.worldId)).get();
      const spec: CausalEventSpec = {
        id: input.preview.id,
        type: input.preview.type,
        summary: input.preview.summary,
        fact: input.preview.fact,
        locationId: input.preview.locationId ?? undefined,
        involvedNpcIds: input.preview.involvedNpcIds,
        audience: input.preview.audience,
        gameMinute: input.preview.gameMinute ?? undefined,
        source: "player",
      };
      const diffs = computeKnowledgeSpread(
        spec,
        npcRows.map((row) => ({ profile: NpcProfileSchema.parse(JSON.parse(row.profileJson)), state: NpcStateSchema.parse(JSON.parse(row.stateJson)) })),
        qixiBlueprint,
      );
      const now = new Date().toISOString();
      const version = current.version + 1;
      const branchId = current.activeBranchId ?? this.mainBranchId(current.id);
      const event: TownEvent = {
        id: randomUUID(), worldId: current.id, branchId, version, gameMinute: spec.gameMinute ?? current.gameMinute,
        type: "factory.event", actorId: playerRow?.id ?? null, summary: `你注入事件：${clip(spec.summary, 60)}`, source: "player",
        causeIds: [], schemaVersion: 1, payload: {
          previewId: spec.id, kind: spec.type, audience: spec.audience, locationId: spec.locationId ?? null,
          fact: spec.fact, gameMinute: spec.gameMinute ?? null,
        }, createdAt: now,
      };
      this.handle.db.update(worlds).set({ version, activeBranchId: branchId, updatedAt: now, gameMinute: spec.gameMinute ?? current.gameMinute }).where(eq(worlds.id, current.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      const eventMinute = spec.gameMinute ?? current.gameMinute;
      const tone = /取消|暴雨|风暴|火灾|事故|停电|停水|受伤|失窃|警报|紧急/.test(spec.summary) ? "negative" as const : "neutral" as const;
      const affectedNpcs = diffs.map((diff) => {
        const knowledgeId = randomUUID();
        this.handle.db.insert(knowledge).values({
          id: knowledgeId, worldId: current.id, agentId: diff.agentId,
          factJson: JSON.stringify({ ...diff.fact, eventId: event.id }), sourceEventId: event.id,
          confidence: Math.round(diff.confidence * 10) / 10, createdAt: now,
        }).run();
        const isLivedThrough = diff.via === "involved" || diff.via === "sight"
          || (diff.via === "public" && /暴雨|台风|雷雨|风暴|洪水|事故|火灾|停电|预警|警报/.test(spec.summary));
        if (isLivedThrough) {
          const importance = computeMemoryImportance({ kind: "event", eventType: spec.type, via: diff.via === "public" ? "sight" : diff.via, tone });
          const lead = diff.via === "involved" ? "我亲历了：" : diff.via === "public" ? "全镇都听说了：" : "我目睹了：";
          this.writeMemory({
            worldId: current.id, agentId: diff.agentId, kind: "event",
            content: `${lead}${clip(spec.summary, 70)}`,
            importance, subject: spec.locationId ?? spec.involvedNpcIds[0] ?? diff.fact.locationId ?? null,
            worldMinute: eventMinute, sourceIdentifier: `event:${current.id}:${diff.agentId}:${event.id}`,
            metadataJson: JSON.stringify({ sourceEventId: event.id, locationId: spec.locationId ?? null, tone, importanceVia: "rule" }),
          }, now);
        }
        return { agentId: diff.agentId, knowledgeId, via: diff.via, confidence: Math.round(diff.confidence * 10) / 10 };
      });
      const npcCount = npcRows.length;
      const result: EventCommitResult = {
        event,
        world: this.toWorldSummary({ ...current, version, activeBranchId: branchId, gameMinute: spec.gameMinute ?? current.gameMinute }, npcCount),
        affectedNpcs,
        replayed: false,
      };
      this.handle.db.insert(commandReceipts).values({
        idempotencyKey: input.idempotencyKey, worldId: current.id, commandType: "event.commit",
        baseVersion: input.expectedVersion, committedVersion: version, responseJson: JSON.stringify(result), createdAt: now,
      }).run();
      return { kind: "ok", result } as const;
    })();
  }

  getKnownEventSummaries(worldId: string, npcId: string, limit = 5): Array<{ eventId: string; type: string; summary: string; gameMinute: number }> {
    return this.handle.db
      .select({
        eventId: events.id,
        type: events.type,
        summary: events.summary,
        gameMinute: events.gameMinute,
      })
      .from(knowledge)
      .innerJoin(events, eq(knowledge.sourceEventId, events.id))
      .where(and(eq(knowledge.worldId, worldId), eq(knowledge.agentId, npcId)))
      .orderBy(desc(knowledge.createdAt))
      .limit(limit)
      .all();
  }

  getCausalGraph(worldId: string, limit = 40): CausalGraph | null {
    const world = this.handle.db.select().from(worlds).where(eq(worlds.id, worldId)).get();
    if (!world) return null;
    const branchId = world.activeBranchId ?? this.mainBranchId(worldId);
    const rows = this.handle.db.select().from(events).where(and(eq(events.worldId, worldId), eq(events.branchId, branchId))).orderBy(desc(events.version)).limit(limit).all();
    const eventsOut = rows.map((row) => this.toEvent(row));
    const edges = eventsOut.flatMap((event) => event.causeIds.map((from) => ({ from, to: event.id, relation: "cause" })));
    return { worldId, events: eventsOut, edges };
  }

  getActiveDialogueNpcIds(worldId: string): string[] {
    return this.handle.db
      .select({ npcId: dialogueSessions.npcId })
      .from(dialogueSessions)
      .where(and(eq(dialogueSessions.worldId, worldId), eq(dialogueSessions.status, "active")))
      .all()
      .map((row) => row.npcId);
  }

  endDialogue(input: { userId: string; sessionId: string }): DialogueEndResult | null {
    return this.handle.sqlite.transaction(() => {
      const session = this.handle.db.select().from(dialogueSessions).where(and(eq(dialogueSessions.id, input.sessionId), eq(dialogueSessions.status, "active"))).get();
      if (!session) return null;
      const player = this.handle.db.select().from(players).where(and(eq(players.id, session.playerId), eq(players.userId, input.userId))).get();
      const world = this.handle.db.select().from(worlds).where(eq(worlds.id, session.worldId)).get();
      const npcRow = this.handle.db.select().from(npcs).where(eq(npcs.id, session.npcId)).get();
      if (!player || !world || !npcRow) return null;
      const now = new Date().toISOString();
      const state = NpcStateSchema.parse(JSON.parse(npcRow.stateJson));
      const npc: Npc = { profile: NpcProfileSchema.parse(JSON.parse(npcRow.profileJson)), state: { ...state, currentAction: "结束交谈", actionReason: "对话结束，准备根据当前状态重新规划。", actionEndsAtMinute: world.gameMinute } };
      const version = world.version + 1;
      const branchId = world.activeBranchId ?? this.mainBranchId(world.id);
      const event: TownEvent = {
        id: randomUUID(), worldId: world.id, branchId, version, gameMinute: world.gameMinute,
        type: "dialogue.ended", actorId: player.id, summary: `你结束了与${npc.profile.name}的交谈`, source: "player",
        causeIds: [], schemaVersion: 1, payload: { sessionId: session.id, npcId: npc.profile.id }, createdAt: now,
      };
      this.handle.db.update(npcs).set({ stateJson: JSON.stringify(npc.state), updatedAt: now }).where(eq(npcs.id, session.npcId)).run();
      this.handle.db.update(dialogueSessions).set({ status: "ended", endedAt: now }).where(eq(dialogueSessions.id, session.id)).run();
      this.handle.db.update(worlds).set({ version, activeBranchId: branchId, updatedAt: now }).where(eq(worlds.id, world.id)).run();
      this.insertEvent(event);
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, world.id)).all().length;
      return { session: this.getDialogueSession(session.id)!, npc, world: this.toWorldSummary({ ...world, version, activeBranchId: branchId }, npcCount), event };
    })();
  }

  listEventsAfter(worldId: string, branchId: string, afterVersion: number, limit: number): TownEvent[] {
    return this.handle.db.select().from(events).where(and(
      eq(events.worldId, worldId),
      eq(events.branchId, branchId),
      gt(events.version, afterVersion),
    )).orderBy(asc(events.version)).limit(limit).all().map((row) => this.toEvent(row));
  }

  getSnapshotCount(worldId: string): number {
    return this.handle.db.select().from(snapshots).where(eq(snapshots.worldId, worldId)).all().length;
  }

  listAiTraces(userId: string, worldId: string, agentId: string, limit = 10): AiTrace[] | null {
    if (!this.ownsWorld(userId, worldId)) return null;
    return this.handle.db.select().from(aiTraces).where(and(
      eq(aiTraces.worldId, worldId),
      eq(aiTraces.agentId, agentId),
    )).orderBy(desc(aiTraces.createdAt)).limit(Math.max(1, Math.min(50, limit))).all()
      .map((row) => AiTraceSchema.parse(JSON.parse(row.traceJson)));
  }

  listWorldTraces(worldId: string, limit = 30, role?: string): AiTrace[] {
    const base = and(eq(aiTraces.worldId, worldId), role ? eq(aiTraces.role, role) : undefined);
    return this.handle.db.select().from(aiTraces).where(base).orderBy(desc(aiTraces.createdAt)).limit(Math.max(1, Math.min(100, limit))).all()
      .map((row) => AiTraceSchema.parse(JSON.parse(row.traceJson)));
  }

  writeMemory(row: MemoryWriteRow, now = new Date().toISOString()): void {
    if (!row.sourceIdentifier) return;
    if (row.worldMinute < 0) return;
    const existing = this.handle.db.select({ id: memories.id }).from(memories).where(eq(memories.sourceIdentifier, row.sourceIdentifier)).get();
    if (existing) return;
    this.handle.db.insert(memories).values({
      id: randomUUID(), worldId: row.worldId, agentId: row.agentId, kind: row.kind, content: clip(row.content, 240),
      metadataJson: row.metadataJson, worldMinute: row.worldMinute, importance: Math.max(1, Math.min(100, Math.round(row.importance))),
      subject: row.subject, sourceIdentifier: row.sourceIdentifier, isArchived: false, createdAt: now,
    }).run();
  }

  listMemories(worldId: string, agentId: string, opts: { kind?: string; limit?: number; includeArchived?: boolean } = {}): MemoryEntry[] {
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 200));
    const filters = [eq(memories.worldId, worldId), eq(memories.agentId, agentId)];
    if (opts.kind) filters.push(eq(memories.kind, opts.kind));
    if (!opts.includeArchived) filters.push(eq(memories.isArchived, false));
    return this.handle.db.select().from(memories).where(and(...filters)).orderBy(desc(memories.worldMinute), desc(memories.createdAt)).limit(limit).all().map((row) => ({
      id: row.id, worldId: row.worldId, agentId: row.agentId, kind: row.kind as MemoryEntry["kind"], content: row.content,
      importance: row.importance, subject: row.subject, worldMinute: row.worldMinute, metadataJson: row.metadataJson,
      sourceIdentifier: row.sourceIdentifier ?? "", isArchived: Boolean(row.isArchived), createdAt: row.createdAt,
    }));
  }

  recallMemories(worldId: string, agentId: string, query: string, opts: { worldTimeMinute?: number | null; relatedAgentId?: string; locationId?: string; maxEntries?: number; maxChars?: number } = {}): RecalledMemory[] {
    const rows = this.handle.db.select().from(memories).where(and(eq(memories.worldId, worldId), eq(memories.agentId, agentId), eq(memories.isArchived, false))).all();
    const views: MemoryEntryView[] = rows.map((row) => ({
      id: row.id, kind: row.kind as MemoryEntryView["kind"], content: row.content, importance: row.importance,
      subject: row.subject, createdAtMinute: row.worldMinute, archived: Boolean(row.isArchived), sourceIdentifier: row.sourceIdentifier ?? null,
    }));
    return retrieveMemories(views, {
      agentId, query,
      worldTimeMinute: opts.worldTimeMinute === undefined ? null : opts.worldTimeMinute,
      relatedAgentId: opts.relatedAgentId, locationId: opts.locationId,
      budget: { maxEntries: opts.maxEntries ?? 6, maxChars: opts.maxChars ?? 600 },
    });
  }

  createJob(input: { kind: string; worldId?: string | null; payload: Record<string, unknown> }): Job {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.handle.db.insert(jobs).values({
      id, worldId: input.worldId ?? null, kind: input.kind, status: "queued", payloadJson: JSON.stringify(input.payload),
      progressJson: JSON.stringify({ stageIndex: 0, stageLabel: "QUEUED", progressPercent: 0 }), attempts: 0, createdAt: now, updatedAt: now,
    }).run();
    return this.getJob(id)!;
  }

  getJob(jobId: string): Job | null {
    const row = this.handle.db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    return row ? this.toJob(row) : null;
  }

  getJobPayload(jobId: string): string {
    return this.handle.db.select({ payloadJson: jobs.payloadJson }).from(jobs).where(eq(jobs.id, jobId)).get()?.payloadJson ?? "{}";
  }

  claimJob(leaseMs = 60_000): Job | null {
    const now = new Date().toISOString();
    const expiredAt = new Date(new Date(now).getTime() - leaseMs).toISOString();
    const next = this.handle.db.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(asc(jobs.createdAt)).get()
      ?? this.handle.db.select().from(jobs).where(and(eq(jobs.status, "running"), lt(jobs.leaseExpiresAt, expiredAt))).orderBy(asc(jobs.createdAt)).get();
    if (!next) return null;
    this.handle.db.update(jobs).set({
      status: "running",
      leaseExpiresAt: new Date(new Date(now).getTime() + leaseMs).toISOString(),
      attempts: next.attempts + 1,
      updatedAt: now,
    }).where(eq(jobs.id, next.id)).run();
    return this.getJob(next.id);
  }

  renewLease(jobId: string, leaseMs = 60_000): void {
    this.handle.db.update(jobs).set({ leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(), updatedAt: new Date().toISOString() }).where(eq(jobs.id, jobId)).run();
  }

  updateJobProgress(jobId: string, patch: { stageIndex?: number; stageLabel?: string; progressPercent?: number; note?: string }): void {
    const row = this.handle.db.select().from(jobs).where(eq(jobs.id, jobId)).get();
    if (!row) return;
    const current = row.progressJson ? JSON.parse(row.progressJson) as { stageIndex: number; stageLabel: string; progressPercent: number; note?: string } : { stageIndex: 0, stageLabel: "QUEUED", progressPercent: 0 };
    this.handle.db.update(jobs).set({
      progressJson: JSON.stringify({
        stageIndex: patch.stageIndex ?? current.stageIndex,
        stageLabel: patch.stageLabel ?? current.stageLabel,
        progressPercent: patch.progressPercent ?? current.progressPercent,
        note: patch.note ?? current.note,
      }),
      updatedAt: new Date().toISOString(),
    }).where(eq(jobs.id, jobId)).run();
  }

  completeJob(jobId: string, result: Record<string, unknown>): void {
    this.handle.db.update(jobs).set({ status: "succeeded", resultJson: JSON.stringify(result), updatedAt: new Date().toISOString() }).where(eq(jobs.id, jobId)).run();
  }

  failJob(jobId: string, error: string): void {
    this.handle.db.update(jobs).set({ status: "failed", error: error.slice(0, 500), updatedAt: new Date().toISOString() }).where(eq(jobs.id, jobId)).run();
  }

  listSnapshots(worldId: string, limit = 20): Array<{ id: string; branchId: string; version: number; gameMinute: number; reason: string; checksum: string; createdAt: string }> {
    return this.handle.db.select().from(snapshots).where(eq(snapshots.worldId, worldId)).orderBy(desc(snapshots.gameMinute), desc(snapshots.version)).limit(Math.max(1, Math.min(limit, 100))).all()
      .map((row) => ({ id: row.id, branchId: row.branchId, version: row.version, gameMinute: row.gameMinute, reason: row.reason, checksum: row.checksum, createdAt: row.createdAt }));
  }

  createGeneratedWorld(input: { userId: string; pkg: WorldPackage; prompt: string; seed: number; mapPngB64: string | null }): WorldSummary {
    const now = new Date().toISOString();
    const worldId = input.pkg.worldId;
    return this.handle.sqlite.transaction(() => {
      this.handle.db.insert(worlds).values({
        id: worldId, userId: input.userId, name: input.pkg.name, description: input.pkg.description,
        gameMinute: 500, version: 1, paused: false, activeBranchId: this.mainBranchId(worldId),
        blueprintJson: JSON.stringify(input.pkg.blueprint), rulesJson: JSON.stringify(input.pkg.rules ?? {}),
        assetJson: JSON.stringify(input.pkg.asset ?? null), mapPngB64: input.mapPngB64, genSeed: input.seed,
        updatedAt: now,
      }).run();
      const branchId = this.mainBranchId(worldId);
      this.handle.db.insert(worldBranches).values({ id: branchId, worldId, parentBranchId: null, forkEventId: null, headVersion: 1, createdAt: now }).run();
      for (const npc of input.pkg.npcs) {
        this.handle.db.insert(npcs).values({ id: npc.profile.id, worldId, profileJson: JSON.stringify(npc.profile), stateJson: JSON.stringify(npc.state), updatedAt: now }).run();
      }
      const spawn = input.pkg.blueprint.spawnPoints[0]?.position ?? { x: 450, y: 310 };
      this.handle.db.insert(players).values({ id: `player_${input.userId}_${worldId}`, worldId, userId: input.userId, name: "旅人", positionJson: JSON.stringify(spawn), updatedAt: now }).run();
      const summary: WorldSummary = { id: worldId, name: input.pkg.name, description: input.pkg.description, gameMinute: 500, version: 1, paused: false, activeBranchId: branchId, npcCount: input.pkg.npcs.length };
      const snapshotJson = JSON.stringify({ world: summary, npcs: input.pkg.npcs });
      this.handle.db.insert(snapshots).values({ id: randomUUID(), worldId, branchId, version: 1, gameMinute: 500, reason: "initial", stateJson: snapshotJson, checksum: computeSnapshotChecksum(snapshotJson), createdAt: now }).run();
      return summary;
    })();
  }

  getWorldBlueprint(userId: string, worldId: string): { blueprint: WorldBlueprint; asset: Record<string, unknown> | null; mapPngB64: string | null } | null {
    const world = this.handle.db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
    if (!world) return null;
    if (world.blueprintJson) return { blueprint: JSON.parse(world.blueprintJson) as WorldBlueprint, asset: world.assetJson ? JSON.parse(world.assetJson) : null, mapPngB64: world.mapPngB64 };
    return { blueprint: qixiBlueprint, asset: null, mapPngB64: null };
  }

  getWorldMapPng(userId: string, worldId: string): string | null {
    const world = this.handle.db.select({ mapPngB64: worlds.mapPngB64 }).from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
    return world?.mapPngB64 ?? null;
  }

  executeCreateBranchCommand(input: { userId: string; worldId: string; forkEventId?: string | null; expectedVersion?: number; idempotencyKey?: string }): { kind: "ok"; branch: { id: string; parentBranchId: string; forkEventId: string | null; headVersion: number }; world: WorldSummary } | { kind: "not_found" } | { kind: "idempotency_conflict" } | { kind: "version_conflict"; currentVersion: number } {
    return this.handle.sqlite.transaction(() => {
      const current = this.handle.db.select().from(worlds).where(and(eq(worlds.id, input.worldId), eq(worlds.userId, input.userId))).get();
      if (!current) return { kind: "not_found" } as const;
      if (input.idempotencyKey) {
        const receipt = this.handle.db.select().from(commandReceipts).where(eq(commandReceipts.idempotencyKey, input.idempotencyKey)).get();
        if (receipt && receipt.commandType !== "world.branch") return { kind: "idempotency_conflict" } as const;
      }
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) return { kind: "version_conflict", currentVersion: current.version } as const;
      const now = new Date().toISOString();
      const parentBranchId = current.activeBranchId ?? this.mainBranchId(current.id);
      const forkEventId = input.forkEventId ?? null;
      let snapshotRow: typeof snapshots.$inferSelect | undefined;
      if (forkEventId) {
        const forkEvent = this.handle.db.select().from(events).where(and(eq(events.id, forkEventId), eq(events.worldId, current.id))).get();
        snapshotRow = forkEvent ? this.handle.db.select().from(snapshots).where(and(eq(snapshots.worldId, current.id), eq(snapshots.branchId, forkEvent.branchId ?? this.mainBranchId(current.id)), eq(snapshots.gameMinute, forkEvent.gameMinute))).get() : undefined;
        snapshotRow = snapshotRow ?? this.handle.db.select().from(snapshots).where(and(eq(snapshots.worldId, current.id), eq(snapshots.gameMinute, forkEvent?.gameMinute ?? 0))).get();
      }
      const branchId = `branch_${current.id}_${randomUUID().slice(0, 8)}`;
      this.handle.db.insert(worldBranches).values({ id: branchId, worldId: current.id, parentBranchId, forkEventId, headVersion: snapshotRow?.version ?? current.version, createdAt: now }).run();
      const restoredGameMinute = snapshotRow?.gameMinute ?? current.gameMinute;
      const restoredVersion = snapshotRow?.version ?? current.version;
      if (snapshotRow) {
        const state = JSON.parse(snapshotRow.stateJson) as { world: { npcCount?: number }; npcs?: Array<{ profile: NpcProfile; state: NpcState }> };
        const rows = state.npcs ?? [];
        for (const npc of rows) {
          this.handle.db.update(npcs).set({ stateJson: JSON.stringify(npc.state), updatedAt: now }).where(and(eq(npcs.id, npc.profile.id), eq(npcs.worldId, current.id))).run();
        }
      }
      this.handle.db.update(worlds).set({ activeBranchId: branchId, gameMinute: restoredGameMinute, version: restoredVersion, updatedAt: now }).where(eq(worlds.id, current.id)).run();
      const npcCount = this.handle.db.select().from(npcs).where(eq(npcs.worldId, current.id)).all().length;
      const summary = this.toWorldSummary({ ...current, activeBranchId: branchId, gameMinute: restoredGameMinute, version: restoredVersion, paused: true }, npcCount);
      this.handle.db.update(worlds).set({ paused: true }).where(eq(worlds.id, current.id)).run();
      if (input.idempotencyKey) {
        this.handle.db.insert(commandReceipts).values({ idempotencyKey: input.idempotencyKey, worldId: current.id, commandType: "world.branch", baseVersion: current.version, committedVersion: restoredVersion, responseJson: JSON.stringify({ branchId, world: summary }), createdAt: now }).run();
      }
      return { kind: "ok", branch: { id: branchId, parentBranchId, forkEventId, headVersion: restoredVersion }, world: { ...summary, paused: true } } as const;
    })();
  }

  private maybeWriteSnapshot(worldId: string, branchId: string, version: number, gameMinute: number, eventType: string, summary: WorldSummary, npcs: Npc[], now: string): { id: string; reason: string } | null {
    const decision = shouldSnapshot(version, gameMinute, eventType, this.getSnapshotCount(worldId));
    if (!decision.should) return null;
    const snapshotJson = JSON.stringify({ world: summary, npcs });
    const id = randomUUID();
    this.handle.db.insert(snapshots).values({ id, worldId, branchId, version, gameMinute, reason: decision.reason, stateJson: snapshotJson, checksum: computeSnapshotChecksum(snapshotJson), createdAt: now }).run();
    return { id, reason: decision.reason };
  }

  private toJob(row: typeof jobs.$inferSelect): Job {
    const progress = row.progressJson ? JSON.parse(row.progressJson) as { stageIndex: number; stageLabel: string; progressPercent: number } : { stageIndex: 0, stageLabel: "QUEUED", progressPercent: 0 };
    return { id: row.id, worldId: row.worldId, kind: row.kind, status: row.status as Job["status"], stageIndex: progress.stageIndex, stageLabel: progress.stageLabel, progressPercent: Math.max(0, Math.min(100, progress.progressPercent)), error: row.error, resultJson: row.resultJson, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  private getPlayer(userId: string, worldId: string): Player | null {
    const row = this.handle.db.select().from(players).where(and(eq(players.worldId, worldId), eq(players.userId, userId))).get();
    return row ? this.toPlayer(row) : null;
  }

  private getDialogueSession(sessionId: string): DialogueSession | null {
    const row = this.handle.db.select().from(dialogueSessions).where(eq(dialogueSessions.id, sessionId)).get();
    if (!row) return null;
    const messages = this.handle.db.select().from(dialogueMessages).where(eq(dialogueMessages.sessionId, row.id)).orderBy(asc(dialogueMessages.createdAt)).all();
    return DialogueSessionSchema.parse({ ...row, messages });
  }

  private toPlayer(row: typeof players.$inferSelect): Player {
    return PlayerSchema.parse({ id: row.id, userId: row.userId, worldId: row.worldId, name: row.name, position: JSON.parse(row.positionJson) });
  }

  private toEvent(row: typeof events.$inferSelect): TownEvent {
    return {
      id: row.id,
      worldId: row.worldId,
      branchId: row.branchId ?? this.mainBranchId(row.worldId),
      version: row.version,
      gameMinute: row.gameMinute,
      type: row.type,
      actorId: row.actorId,
      summary: row.summary,
      source: eventSourceValues.includes(row.source as EventSource) ? row.source as EventSource : "system",
      causeIds: JSON.parse(row.causeIdsJson) as string[],
      schemaVersion: row.schemaVersion,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt,
    };
  }

  private ensureWorldFoundation(worldId: string): void {
    const world = this.handle.db.select().from(worlds).where(eq(worlds.id, worldId)).get();
    if (!world) return;
    const branchId = world.activeBranchId ?? this.mainBranchId(worldId);
    const now = new Date().toISOString();
    this.handle.sqlite.transaction(() => {
      this.handle.db.insert(worldBranches).values({
        id: branchId,
        worldId,
        parentBranchId: null,
        forkEventId: null,
        headVersion: world.version,
        createdAt: now,
      }).onConflictDoNothing().run();
      this.handle.db.update(worlds).set({ activeBranchId: branchId }).where(eq(worlds.id, worldId)).run();
      this.handle.db.update(events).set({ branchId }).where(and(eq(events.worldId, worldId), isNull(events.branchId))).run();

      const existing = this.handle.db.select({ id: snapshots.id }).from(snapshots).where(eq(snapshots.branchId, branchId)).get();
      if (existing) return;
      const npcRows = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldId)).all();
      const state = {
        world: this.toWorldSummary({ ...world, activeBranchId: branchId }, npcRows.length),
        player: this.getPlayer(world.userId, worldId),
        npcs: npcRows.map((row) => ({ profile: JSON.parse(row.profileJson), state: JSON.parse(row.stateJson) })),
      };
      const stateJson = JSON.stringify(state);
      this.handle.db.insert(snapshots).values({
        id: randomUUID(),
        worldId,
        branchId,
        version: world.version,
        gameMinute: world.gameMinute,
        reason: "initial",
        stateJson,
        checksum: createHash("sha256").update(stateJson).digest("hex"),
        createdAt: now,
      }).run();
    })();
  }

  private mainBranchId(worldId: string): string {
    return `branch_${worldId}_main`;
  }

  private insertEvent(event: TownEvent): void {
    this.handle.db.insert(events).values({
      id: event.id,
      worldId: event.worldId,
      branchId: event.branchId,
      version: event.version,
      gameMinute: event.gameMinute,
      type: event.type,
      actorId: event.actorId,
      summary: event.summary,
      source: event.source,
      causeIdsJson: JSON.stringify(event.causeIds),
      schemaVersion: event.schemaVersion,
      payloadJson: JSON.stringify(event.payload),
      createdAt: event.createdAt,
    }).run();
  }

  private toWorldSummary(world: typeof worlds.$inferSelect, npcCount: number): WorldSummary {
    return {
      id: world.id,
      name: world.name,
      description: world.description,
      gameMinute: world.gameMinute,
      version: world.version,
      paused: world.paused,
      activeBranchId: world.activeBranchId ?? this.mainBranchId(world.id),
      npcCount,
    };
  }
}

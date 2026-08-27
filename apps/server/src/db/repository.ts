import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import type { Npc, NpcProfile, NpcState, TownEvent, WorldState, WorldSummary } from "@ai-town/shared";
import { NpcProfileSchema, NpcStateSchema } from "@ai-town/shared";
import type { DatabaseHandle } from "./database.js";
import { commandReceipts, events, npcs, snapshots, users, worldBranches, worlds } from "./schema.js";
import { demoNpcs, demoWorld, DEMO_USER_ID } from "../domain/seed.js";

export const eventSourceValues = ["system", "player", "ai", "mock"] as const;
type EventSource = (typeof eventSourceValues)[number];

export type PendingWorldEvent = Omit<TownEvent, "id" | "branchId" | "version" | "createdAt" | "schemaVersion" | "source" | "causeIds"> & {
  source?: EventSource;
  causeIds?: string[];
};

export type PauseCommandResult =
  | { kind: "ok"; world: WorldSummary; event: TownEvent | null; replayed: boolean }
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

  commitTick(worldId: string, expectedVersion: number, gameMinute: number, updatedNpcs: Npc[], newEvents: PendingWorldEvent[]): { world: WorldSummary; events: TownEvent[] } | null {
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
      this.handle.db.update(worldBranches).set({ headVersion: version }).where(eq(worldBranches.id, branchId)).run();
      return {
        world: this.toWorldSummary({ ...current, gameMinute, version, activeBranchId: branchId }, updatedNpcs.length),
        events: committed,
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

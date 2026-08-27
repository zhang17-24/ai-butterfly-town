import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Npc, NpcProfile, NpcState, TownEvent, WorldState, WorldSummary } from "@ai-town/shared";
import { NpcProfileSchema, NpcStateSchema } from "@ai-town/shared";
import type { DatabaseHandle } from "./database.js";
import { events, npcs, users, worlds } from "./schema.js";
import { demoNpcs, demoWorld, DEMO_USER_ID } from "../domain/seed.js";

export class TownRepository {
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
      npcCount: this.handle.db.select().from(npcs).where(eq(npcs.worldId, world.id)).all().length,
    }));
  }

  ownsWorld(userId: string, worldId: string): boolean {
    return !!this.handle.db.select({ id: worlds.id }).from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
  }

  getWorldState(userId: string, worldId: string): WorldState | null {
    const world = this.handle.db.select().from(worlds).where(and(eq(worlds.id, worldId), eq(worlds.userId, userId))).get();
    if (!world) return null;
    const npcRows = this.handle.db.select().from(npcs).where(eq(npcs.worldId, worldId)).all();
    const eventRows = this.handle.db.select().from(events).where(eq(events.worldId, worldId)).orderBy(desc(events.version)).limit(24).all();
    return {
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        gameMinute: world.gameMinute,
        version: world.version,
        paused: world.paused,
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
        npcCount: npcRows.length,
      },
      npcs: npcRows.map((row) => ({ profile: JSON.parse(row.profileJson), state: JSON.parse(row.stateJson) })),
    };
  }

  commitTick(worldId: string, gameMinute: number, version: number, updatedNpcs: Npc[], newEvents: Omit<TownEvent, "id" | "createdAt">[]): TownEvent[] {
    const now = new Date().toISOString();
    const committed = newEvents.map((event) => ({ ...event, id: randomUUID(), createdAt: now }));
    this.handle.sqlite.transaction(() => {
      this.handle.db.update(worlds).set({ gameMinute, version, updatedAt: now }).where(eq(worlds.id, worldId)).run();
      for (const npc of updatedNpcs) {
        this.handle.db.update(npcs).set({ stateJson: JSON.stringify(npc.state), updatedAt: now }).where(eq(npcs.id, npc.profile.id)).run();
      }
      for (const event of committed) {
        this.handle.db.insert(events).values({
          id: event.id,
          worldId: event.worldId,
          version: event.version,
          gameMinute: event.gameMinute,
          type: event.type,
          actorId: event.actorId,
          summary: event.summary,
          payloadJson: JSON.stringify(event.payload),
          createdAt: event.createdAt,
        }).run();
      }
    })();
    return committed;
  }

  setPaused(userId: string, worldId: string, paused: boolean): WorldSummary | null {
    if (!this.ownsWorld(userId, worldId)) return null;
    this.handle.db.update(worlds).set({ paused, updatedAt: new Date().toISOString() }).where(eq(worlds.id, worldId)).run();
    return this.listWorlds(userId).find((world) => world.id === worldId) ?? null;
  }

  private toEvent(row: typeof events.$inferSelect): TownEvent {
    return {
      id: row.id,
      worldId: row.worldId,
      version: row.version,
      gameMinute: row.gameMinute,
      type: row.type,
      actorId: row.actorId,
      summary: row.summary,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt,
    };
  }
}

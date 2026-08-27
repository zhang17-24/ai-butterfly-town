import { randomUUID } from "node:crypto";
import type { Npc, RealtimeMessage } from "@ai-town/shared";
import type { PendingWorldEvent, TownRepository } from "../db/repository.js";
import type { WorldHub } from "../realtime/world-hub.js";
import { applyActionEffects, applyPassiveMinute, chooseMockAction } from "../domain/mock-decision.js";

export class SimulationService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private repository: TownRepository, private hub: WorldHub, private tickMs: number) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const worldId of this.repository.listActiveWorldIds()) this.tickWorld(worldId);
    } finally {
      this.running = false;
    }
  }

  private tickWorld(worldId: string): void {
    const snapshot = this.repository.getSimulationState(worldId);
    if (!snapshot || snapshot.world.paused) return;
    const gameMinute = snapshot.world.gameMinute + 1;
    const version = snapshot.world.version + 1;
    const pendingEvents: PendingWorldEvent[] = [];

    const updatedNpcs = snapshot.npcs.map((npc): Npc => {
      let state = applyPassiveMinute(npc.state);
      if (state.actionEndsAtMinute <= gameMinute) {
        const action = chooseMockAction({ ...npc, state }, gameMinute, version);
        state = applyActionEffects(state, action);
        state = {
          ...state,
          locationId: action.destination.locationId,
          position: action.destination.position,
          currentAction: action.label,
          actionReason: action.reason,
          actionEndsAtMinute: gameMinute + action.durationMinutes,
        };
        pendingEvents.push({
          worldId,
          gameMinute,
          type: "npc.action_started",
          actorId: npc.profile.id,
          summary: `${npc.profile.name}${action.label}`,
          source: "mock",
          causeIds: [],
          payload: {
            action: action.label,
            reason: action.reason,
            locationId: action.destination.locationId,
            position: action.destination.position,
            source: "mock",
            score: Number(action.score.toFixed(2)),
          },
        });
      }
      return { profile: npc.profile, state };
    });

    const committed = this.repository.commitTick(worldId, snapshot.world.version, gameMinute, updatedNpcs, pendingEvents);
    if (!committed) return;
    this.hub.broadcast(worldId, {
      eventId: randomUUID(),
      worldId,
      branchId: committed.world.activeBranchId,
      version: committed.world.version,
      emittedAt: new Date().toISOString(),
      type: "world.tick",
      data: { worldId, gameMinute, version: committed.world.version, npcs: updatedNpcs, events: committed.events },
    } satisfies RealtimeMessage);
  }
}

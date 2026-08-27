import { randomUUID } from "node:crypto";
import type { AiTrace, Npc, NpcState, RealtimeMessage } from "@ai-town/shared";
import type { PendingWorldEvent, TownRepository } from "../db/repository.js";
import type { WorldHub } from "../realtime/world-hub.js";
import { applyActionEffects, applyPassiveMinute } from "../domain/mock-decision.js";
import type { SimulationDecisionService } from "../ai/simulation-decider.js";
import { createNavigationGrid, findApproachPath, findNearestWalkable } from "../navigation/a-star.js";
import { qixiBlueprint } from "../generation/qixi-blueprint.js";

const navigationGrid = createNavigationGrid(qixiBlueprint);

export class SimulationService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private aiCursor = 0;

  constructor(
    private repository: TownRepository,
    private hub: WorldHub,
    private tickMs: number,
    private decider: SimulationDecisionService,
    private maxAiDecisionsPerTick: number,
  ) {}

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
      for (const worldId of this.repository.listActiveWorldIds()) await this.tickWorld(worldId);
    } finally {
      this.running = false;
    }
  }

  private async tickWorld(worldId: string): Promise<void> {
    const snapshot = this.repository.getSimulationState(worldId);
    if (!snapshot || snapshot.world.paused) return;
    const gameMinute = snapshot.world.gameMinute + 1;
    const talkingNpcIds = new Set(this.repository.getActiveDialogueNpcIds(worldId));
    const dueNpcIds = snapshot.npcs
      .filter((npc) => !talkingNpcIds.has(npc.profile.id) && npc.state.actionEndsAtMinute <= gameMinute)
      .map((npc) => npc.profile.id);
    const aiAllowed = new Set<string>();
    const allowance = Math.min(Math.max(0, this.maxAiDecisionsPerTick), dueNpcIds.length);
    for (let offset = 0; offset < allowance; offset += 1) aiAllowed.add(dueNpcIds[(this.aiCursor + offset) % dueNpcIds.length]);
    if (dueNpcIds.length > 0) this.aiCursor = (this.aiCursor + allowance) % dueNpcIds.length;
    const results = await Promise.all(snapshot.npcs.map(async (npc): Promise<{ npc: Npc; event: PendingWorldEvent | null; trace: AiTrace | null }> => {
      let state = applyPassiveMinute(npc.state);
      if (state.actionEndsAtMinute <= gameMinute) {
        const knownEvents = this.repository.getKnownEventSummaries(worldId, npc.profile.id, 5);
        const decision = await this.decider.decide({ ...npc, state }, snapshot.world, { allowAI: aiAllowed.has(npc.profile.id), knownEvents });
        const action = decision.action;
        const beforeEffects = state;
        const fromPosition = findNearestWalkable(navigationGrid, state.position);
        state = applyActionEffects(state, action);
        const destination = action.destination.position;
        const sameSpot = Math.hypot(fromPosition.x - destination.x, fromPosition.y - destination.y) < 2;
        const approach = sameSpot ? null : findApproachPath(navigationGrid, fromPosition, destination);
        const path = approach && approach.path.length > 1
          ? [state.position, ...approach.path.slice(1)].filter((point, index, points) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
          : approach?.path;
        state = {
          ...state,
          locationId: action.destination.locationId,
          position: destination,
          actionPath: path ?? undefined,
          currentAction: action.label,
          actionReason: action.reason,
          actionEndsAtMinute: gameMinute + action.durationMinutes,
        };
        const trace: AiTrace = { ...decision.trace, stateChanges: stateChanges(beforeEffects, state) };
        return { npc: { profile: npc.profile, state }, trace, event: {
          worldId,
          gameMinute,
          type: "npc.action_started",
          actorId: npc.profile.id,
          summary: `${npc.profile.name}${action.label}`,
          source: trace.source,
          causeIds: [],
          payload: {
            actionId: action.id,
            action: action.label,
            reason: action.reason,
            locationId: action.destination.locationId,
            position: action.destination.position,
            source: trace.source,
            decisionId: trace.id,
            score: Number(action.score.toFixed(2)),
          },
        } };
      }
      return { npc: { profile: npc.profile, state }, event: null, trace: null };
    }));
    const updatedNpcs = results.map((result) => result.npc);
    const pendingEvents = results.flatMap((result) => result.event ? [result.event] : []);
    const traces = results.flatMap((result) => result.trace ? [result.trace] : []);

    const committed = this.repository.commitTick(worldId, snapshot.world.version, gameMinute, updatedNpcs, pendingEvents, traces);
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

function stateChanges(before: NpcState, after: NpcState): AiTrace["stateChanges"] {
  const changes: AiTrace["stateChanges"] = {};
  for (const key of ["hunger", "energy", "mood", "stress", "social"] as const) {
    if (before[key] !== after[key]) changes[key] = { before: before[key], after: after[key] };
  }
  return changes;
}

import { randomUUID } from "node:crypto";
import type { AiTrace, Npc, NpcState, RealtimeMessage, WorldBlueprint, WorldSummary } from "@ai-town/shared";
import type { MemoryWriteRow, PendingWorldEvent, TownRepository } from "../db/repository.js";
import type { WorldHub } from "../realtime/world-hub.js";
import { applyActionEffects, applyPassiveMinute } from "../domain/mock-decision.js";
import type { SimulationDecisionService } from "../ai/simulation-decider.js";
import { createNavigationGrid, findApproachPath, findNearestWalkable } from "../navigation/a-star.js";
import type { NavigationGrid } from "../navigation/a-star.js";
import { buildSkipSchedule } from "../timeline/snapshot-logic.js";
import { maybeSocialize } from "./npc-socialize.js";

export class SimulationService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private aiCursor = 0;
  private readonly navigationByWorld = new Map<string, { blueprint: WorldBlueprint; grid: NavigationGrid }>();

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
    const dueNpcIds = this.dueNpcIds(worldId, snapshot.npcs, gameMinute);
    const aiAllowed = new Set<string>();
    const allowance = Math.min(Math.max(0, this.maxAiDecisionsPerTick), dueNpcIds.length);
    for (let offset = 0; offset < allowance; offset += 1) aiAllowed.add(dueNpcIds[(this.aiCursor + offset) % dueNpcIds.length]);
    if (dueNpcIds.length > 0) this.aiCursor = (this.aiCursor + allowance) % dueNpcIds.length;
    const results = await this.decideMinute(worldId, snapshot, gameMinute, (npcId) => aiAllowed.has(npcId));
    const updatedNpcs = results.map((result) => result.npc);
    const pendingEvents = results.flatMap((result) => result.event ? [result.event] : []);
    const traces = results.flatMap((result) => result.trace ? [result.trace] : []);
    const memories = results.flatMap((result) => result.memory ? [result.memory] : []);
    // NPC 闲聊:同地且空闲的居民偶尔互聊一两句,作为 npc.dialogue 事件随本 tick 广播。
    const nameById = new Map(snapshot.npcs.map((npc) => [npc.profile.id, npc.profile.name]));
    for (const exchange of maybeSocialize(snapshot.npcs, gameMinute)) {
      for (const line of exchange) {
        pendingEvents.push({
          worldId,
          gameMinute,
          type: "npc.dialogue",
          actorId: line.speakerId,
          summary: `${nameById.get(line.speakerId) ?? "居民"}对${nameById.get(line.listenerId) ?? "居民"}说：“${clip(line.line)}”`,
          source: "mock",
          payload: { speakerId: line.speakerId, listenerId: line.listenerId, line: line.line },
        });
      }
    }

    const committed = this.repository.commitTick(worldId, snapshot.world.version, gameMinute, updatedNpcs, pendingEvents, traces, memories);
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

  private dueNpcIds(worldId: string, npcs: Npc[], gameMinute: number): string[] {
    const talkingNpcIds = new Set(this.repository.getActiveDialogueNpcIds(worldId));
    return npcs
      .filter((npc) => !talkingNpcIds.has(npc.profile.id) && npc.state.actionEndsAtMinute <= gameMinute)
      .map((npc) => npc.profile.id);
  }

  private async decideMinute(
    worldId: string,
    snapshot: { world: WorldSummary; npcs: Npc[] },
    gameMinute: number,
    aiAllowedFor: (npcId: string) => boolean,
  ): Promise<Array<{ npc: Npc; event: PendingWorldEvent | null; trace: AiTrace | null; memory: MemoryWriteRow | null }>> {
    const talkingNpcIds = new Set(this.repository.getActiveDialogueNpcIds(worldId));
    const { blueprint, grid: navigationGrid } = this.navigationFor(worldId);
    return Promise.all(snapshot.npcs.map(async (npc): Promise<{ npc: Npc; event: PendingWorldEvent | null; trace: AiTrace | null; memory: MemoryWriteRow | null }> => {
      const state = applyPassiveMinute(npc.state);
      if (talkingNpcIds.has(npc.profile.id)) return { npc: { profile: npc.profile, state }, event: null, trace: null, memory: null };
      if (npc.state.actionEndsAtMinute > gameMinute) return { npc: { profile: npc.profile, state }, event: null, trace: null, memory: null };
      const doneAction: string | null = npc.state.currentAction;
      const doneMinute = Math.min(npc.state.actionEndsAtMinute, gameMinute);
      const doneLocation = npc.state.locationId;
      const knownEvents = this.repository.getKnownEventSummaries(worldId, npc.profile.id, 5);
      const recalled = this.repository.recallMemories(worldId, npc.profile.id, doneAction ? `下一步行动 ${doneAction}` : "下一步行动", {
        worldTimeMinute: gameMinute, maxEntries: 4, maxChars: 400,
      });
      const decision = await this.decider.decide({ ...npc, state }, snapshot.world, { allowAI: aiAllowedFor(npc.profile.id), knownEvents, recalledMemories: recalled, blueprint });
      const action = decision.action;
      const beforeEffects = state;
      const fromPosition = findNearestWalkable(navigationGrid, state.position);
      const afterEffects = applyActionEffects(state, action);
      const destination = findNearestWalkable(navigationGrid, action.destination.position);
      const sameSpot = Math.hypot(fromPosition.x - destination.x, fromPosition.y - destination.y) < 2;
      const approach = sameSpot ? null : findApproachPath(navigationGrid, fromPosition, destination);
      const path = approach && approach.path.length > 1
        ? [state.position, ...approach.path.slice(1)].filter((point, index, points) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
        : approach?.path;
      const nextState = {
        ...afterEffects,
        locationId: action.destination.locationId,
        position: destination,
        actionPath: path ?? undefined,
        currentAction: action.label,
        actionReason: action.reason,
        actionEndsAtMinute: gameMinute + action.durationMinutes,
      };
      const memory: MemoryWriteRow | null = doneAction && doneLocation ? {
        worldId, agentId: npc.profile.id, kind: "action",
        content: `我完成了：${doneAction}（在${doneLocation}）`,
        importance: 40, subject: doneLocation, worldMinute: doneMinute,
        sourceIdentifier: `action:${worldId}:${npc.profile.id}:${doneMinute}`,
        metadataJson: JSON.stringify({ actionId: doneMinute, locationId: doneLocation }),
      } : null;
      const trace: AiTrace = { ...decision.trace, stateChanges: stateChanges(beforeEffects, nextState) };
      return { npc: { profile: npc.profile, state: nextState }, trace, memory, event: {
        worldId,
        gameMinute,
        type: "npc.action_started",
        actorId: npc.profile.id,
        summary: `${npc.profile.name}${action.label}`,
        source: trace.source,
        causeIds: causalEventIds(trace.context),
        payload: {
          actionId: action.id,
          action: action.label,
          reason: action.reason,
          locationId: action.destination.locationId,
          position: destination,
          source: trace.source,
          decisionId: trace.id,
          score: Number(action.score.toFixed(2)),
          recalledMemoryIds: recalled.map((memoryEntry) => memoryEntry.id),
        },
      } };
    }));
  }

  private navigationFor(worldId: string): { blueprint: WorldBlueprint; grid: NavigationGrid } {
    const existing = this.navigationByWorld.get(worldId);
    if (existing) return existing;
    const blueprint = this.repository.getSimulationBlueprint(worldId);
    const navigation = { blueprint, grid: createNavigationGrid(blueprint) };
    this.navigationByWorld.set(worldId, navigation);
    return navigation;
  }

  async advanceTo(worldId: string, targetMinute: number, options: { onProgress?: (minute: number, total: number) => void } = {}): Promise<{ fromMinute: number; toMinute: number; stoppedByEmergency: boolean; stopEventId: string | null; snapshotsWritten: number }> {
    const snapshot = this.repository.getSimulationState(worldId);
    if (!snapshot) throw new Error("WORLD_NOT_FOUND");
    const fromMinute = snapshot.world.gameMinute;
    if (targetMinute <= fromMinute) return { fromMinute, toMinute: fromMinute, stoppedByEmergency: false, stopEventId: null, snapshotsWritten: 0 };
    const wasPaused = snapshot.world.paused;
    if (!wasPaused) this.repository.setPaused(worldId, true);
    const events = this.repository.listEventsAfter(worldId, snapshot.world.activeBranchId, 0, 500)
      .map((event) => ({ id: event.id, gameMinute: event.gameMinute, type: event.type }));
    const schedule = buildSkipSchedule({ gameMinute: fromMinute, currentActionEndsAtMinute: null, events }, targetMinute);
    let snapshotsWritten = 0;
    let stoppedByEmergency = false;
    let stopEventId: string | null = null;
    try {
      for (const step of schedule.steps) {
        for (let minute = step.fromMinute + 1; minute <= step.toMinute; minute += 1) {
          const current = this.repository.getSimulationState(worldId);
          if (!current) break;
          const results = await this.decideMinute(worldId, current, minute, () => false);
          const updatedNpcs = results.map((result) => result.npc);
          const pendingEvents = results.flatMap((result) => result.event ? [result.event] : []);
          const memories = results.flatMap((result) => result.memory ? [result.memory] : []);
          const committed = this.repository.commitTick(worldId, current.world.version, minute, updatedNpcs, pendingEvents, [], memories);
          if (!committed) break;
          if (committed.snapshot) snapshotsWritten += 1;
          options.onProgress?.(minute, targetMinute);
        }
        if (step.kind === "emergency_stop") {
          stoppedByEmergency = true;
          stopEventId = step.atEventId ?? null;
          break;
        }
      }
    } finally {
      if (!wasPaused) this.repository.setPaused(worldId, false);
    }
    const final = this.repository.getSimulationState(worldId);
    if (final) {
      this.hub.broadcast(worldId, {
        eventId: randomUUID(), worldId, branchId: final.world.activeBranchId, version: final.world.version,
        emittedAt: new Date().toISOString(), type: "world.status", data: final.world, event: null,
      } satisfies RealtimeMessage);
    }
    return { fromMinute, toMinute: final?.world.gameMinute ?? targetMinute, stoppedByEmergency, stopEventId, snapshotsWritten };
  }
}

function clip(value: string, max = 60): string {
  return value.trim().slice(0, max);
}

function causalEventIds(context: Record<string, unknown>): string[] {
  return Array.isArray(context.causalEventIds)
    ? context.causalEventIds.filter((value): value is string => typeof value === "string")
    : [];
}

function stateChanges(before: NpcState, after: NpcState): AiTrace["stateChanges"] {
  const changes: AiTrace["stateChanges"] = {};
  for (const key of ["hunger", "energy", "mood", "stress", "social"] as const) {
    if (before[key] !== after[key]) changes[key] = { before: before[key], after: after[key] };
  }
  return changes;
}

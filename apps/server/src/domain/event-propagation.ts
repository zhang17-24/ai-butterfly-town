import type { Npc, Position, WorldBlueprint } from "@ai-town/shared";

export type EventAudience = "public" | "local" | "private";
export type KnowledgeChannel = "involved" | "sight" | "hearing" | "public";

export interface CausalEventSpec {
  id: string;
  type: string;
  summary: string;
  fact: string;
  locationId?: string;
  position?: Position;
  involvedNpcIds: string[];
  audience: EventAudience;
  gameMinute?: number;
  source: "player" | "system";
}

export interface KnowledgeDiff {
  agentId: string;
  fact: Record<string, unknown>;
  sourceEventId: string;
  via: KnowledgeChannel;
  confidence: number;
  channelReason: string;
}

export const DEFAULT_SIGHT_RADIUS = 120;
export const DEFAULT_HEARING_RADIUS = 300;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

function locationCenter(blueprint: WorldBlueprint | undefined, locationId: string): Position | undefined {
  const location = blueprint?.locations.find((item) => item.id === locationId);
  if (!location) return undefined;
  return {
    x: location.bounds.x + location.bounds.width / 2,
    y: location.bounds.y + location.bounds.height / 2,
  };
}

function buildFact(spec: CausalEventSpec): Record<string, unknown> {
  return {
    eventId: spec.id,
    type: spec.type,
    summary: spec.summary,
    fact: spec.fact,
    locationId: spec.locationId ?? null,
    gameMinute: spec.gameMinute ?? null,
    source: spec.source,
  };
}

export function computeKnowledgeSpread(
  spec: CausalEventSpec,
  npcs: Npc[],
  blueprint?: WorldBlueprint,
  options?: { sightRadius?: number; hearingRadius?: number },
): KnowledgeDiff[] {
  const sightRadius = options?.sightRadius ?? DEFAULT_SIGHT_RADIUS;
  const hearingRadius = options?.hearingRadius ?? DEFAULT_HEARING_RADIUS;
  const fact = buildFact(spec);
  const involved = new Set(spec.involvedNpcIds);
  const eventPosition = spec.position ??
    (spec.locationId ? locationCenter(blueprint, spec.locationId) : undefined);

  const diffs: KnowledgeDiff[] = [];
  for (const npc of npcs) {
    const agentId = npc.profile.id;
    const { locationId, position } = npc.state;

    if (involved.has(agentId)) {
      diffs.push({
        agentId,
        fact,
        sourceEventId: spec.id,
        via: "involved",
        confidence: 100,
        channelReason: "是事件的直接涉事 NPC,知晓全部事实。",
      });
      continue;
    }

    if (spec.audience === "public") {
      diffs.push({
        agentId,
        fact,
        sourceEventId: spec.id,
        via: "public",
        confidence: 95,
        channelReason: "全镇广播/公告传达,居民均收到该信息。",
      });
      continue;
    }

    if (spec.audience === "private") {
      continue;
    }

    const onLocation = spec.locationId !== undefined && locationId === spec.locationId;
    if (onLocation) {
      const confidence = clamp(90 + (npc.profile.traits.curiosity - 50) * 0.1, 70, 100);
      diffs.push({
        agentId,
        fact,
        sourceEventId: spec.id,
        via: "sight",
        confidence: Math.round(confidence * 10) / 10,
        channelReason: `身处事件地点(${spec.locationId}),直接目击。`,
      });
      continue;
    }

    if (!eventPosition) {
      continue;
    }

    const dist = distance(eventPosition, position);
    if (dist <= sightRadius) {
      const confidence = clamp(90 + (npc.profile.traits.curiosity - 50) * 0.1, 70, 100);
      diffs.push({
        agentId,
        fact,
        sourceEventId: spec.id,
        via: "sight",
        confidence: Math.round(confidence * 10) / 10,
        channelReason: `距事件点 ${Math.round(dist)} 像素,在目击范围内。`,
      });
    } else if (dist <= hearingRadius) {
      const confidence = clamp(75 + (npc.profile.traits.sociability - 50) * 0.1, 70, 100);
      diffs.push({
        agentId,
        fact,
        sourceEventId: spec.id,
        via: "hearing",
        confidence: Math.round(confidence * 10) / 10,
        channelReason: `距事件点 ${Math.round(dist)} 像素,在可听范围内。`,
      });
    }
  }
  return diffs;
}

export function alreadyKnowsFact(existingFacts: Array<{ eventId?: unknown }>, eventId: string): boolean {
  return existingFacts.some((fact) => fact.eventId === eventId);
}

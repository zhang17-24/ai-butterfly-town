import type { Npc, NpcState } from "@ai-town/shared";

// 落点刻意取在建筑/河流外的可走格（临近入口的道路上），由 a-star 测试保证可达
const destinations = {
  cafe: { locationId: "cafe", position: { x: 265, y: 190 } },
  clinic: { locationId: "clinic", position: { x: 725, y: 190 } },
  grocery: { locationId: "grocery", position: { x: 265, y: 432 } },
  riverside: { locationId: "riverside", position: { x: 470, y: 345 } },
  community: { locationId: "community", position: { x: 725, y: 410 } },
  apartment: { locationId: "apartment", position: { x: 725, y: 540 } },
} as const;

export interface MockAction {
  id: string;
  label: string;
  reason: string;
  durationMinutes: number;
  destination: (typeof destinations)[keyof typeof destinations];
  effects: Partial<Pick<NpcState, "hunger" | "energy" | "mood" | "stress" | "social">>;
  score: number;
}

function stableNoise(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 1000) / 1000;
}

export function chooseMockAction(npc: Npc, gameMinute: number, worldVersion: number): MockAction {
  return getActionCandidates(npc, gameMinute, worldVersion).sort((a, b) => b.score - a.score)[0];
}

export function getActionCandidates(npc: Npc, gameMinute: number, worldVersion: number): MockAction[] {
  const { profile, state } = npc;
  const hour = Math.floor(gameMinute / 60) % 24;
  const workDestination =
    profile.id === "npc_lin_xia" ? destinations.cafe :
    profile.id === "npc_shen_zhiheng" ? destinations.clinic :
    profile.id === "npc_he_jianguo" ? destinations.grocery :
    profile.id === "npc_tang_yucheng" ? destinations.community : destinations.riverside;

  const candidates: MockAction[] = [
    {
      id: "eat_breakfast",
      label: "去咖啡馆吃早餐",
      reason: `饥饿感已到 ${Math.round(state.hunger)}，需要先补充体力。`,
      durationMinutes: 4,
      destination: destinations.cafe,
      effects: { hunger: -42, energy: 8, mood: 4 },
      score: state.hunger * 1.35,
    },
    {
      id: "rest_at_home",
      label: "回公寓休息",
      reason: `精力只剩 ${Math.round(state.energy)}，继续忙碌会影响状态。`,
      durationMinutes: 6,
      destination: destinations.apartment,
      effects: { energy: 34, stress: -16 },
      score: (100 - state.energy) * 1.45,
    },
    {
      id: "socialize_riverside",
      label: "到河岸和邻居聊聊",
      reason: `社交需求为 ${Math.round(state.social)}，也想了解市集近况。`,
      durationMinutes: 4,
      destination: destinations.riverside,
      effects: { social: -38, mood: 7, stress: -4 },
      score: state.social * (0.65 + profile.traits.sociability / 100),
    },
    {
      id: "do_work",
      label: profile.id === "npc_zhou_fang" ? "配送市集物资" : "处理本职工作",
      reason: `责任感 ${profile.traits.conscientiousness}，当前时段适合推进工作。`,
      durationMinutes: 5,
      destination: workDestination,
      effects: { energy: -7, stress: 4, mood: 2 },
      score: profile.traits.conscientiousness + (hour >= 8 && hour < 18 ? 10 : -12),
    },
    {
      id: "walk_riverside",
      label: "沿滨河步道散步",
      reason: `好奇心 ${profile.traits.curiosity}，想看看社区里正在发生什么。`,
      durationMinutes: 3,
      destination: destinations.riverside,
      effects: { energy: -3, mood: 6, stress: -7 },
      score: profile.traits.curiosity * 0.9 + (100 - state.mood) * 0.35,
    },
  ];

  return candidates.map((candidate, index) => ({
      ...candidate,
      score: candidate.score + stableNoise(`${profile.id}:${gameMinute}:${worldVersion}:${index}`) * 4,
    }));
}

export function applyPassiveMinute(state: NpcState): NpcState {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return {
    ...state,
    hunger: clamp(state.hunger + 1.1),
    energy: clamp(state.energy - 0.45),
    stress: clamp(state.stress + (state.hunger > 78 ? 1.2 : -0.15)),
    social: clamp(state.social + 0.55),
  };
}

export function applyActionEffects(state: NpcState, action: MockAction): NpcState {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const next = { ...state };
  for (const key of ["hunger", "energy", "mood", "stress", "social"] as const) {
    next[key] = clamp(next[key] + (action.effects[key] ?? 0));
  }
  return next;
}

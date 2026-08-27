import type { Npc } from "@ai-town/shared";

export interface KnownEventSummary {
  eventId: string;
  type: string;
  summary: string;
  gameMinute: number;
}

const clamp = (value: number) => Math.max(-8, Math.min(8, value));

function kindOf(summary: string): "weather" | "emergency" | "community" | null {
  if (/暴雨|台风|雷雨|洪水|大风|降温|预警|警报|天气/.test(summary)) return "weather";
  if (/事故|火灾|停电|停水|急救|病人|受伤|失窃|走失/.test(summary)) return "emergency";
  if (/市集|摊位|活动|公告|通知|演出|比赛|讲座|聚会/.test(summary)) return "community";
  return null;
}

// 每条已知事件对候选动作的影响（±8 封顶）：不知情 NPC 的 knownEvents 为空 → 恒 0
export function eventInfluence(npc: Npc, knownEvents: KnownEventSummary[]): Map<string, number> {
  const influence = new Map<string, number>();
  const add = (actionId: string, delta: number) => {
    influence.set(actionId, clamp((influence.get(actionId) ?? 0) + delta));
  };
  const role = npc.profile.role;

  for (const event of knownEvents) {
    const kind = kindOf(event.summary);
    if (kind === null) continue;
    const { riskTolerance, sociability } = npc.profile.traits;

    if (kind === "weather" || kind === "emergency") {
      if (riskTolerance < 40) {
        add("rest_at_home", 6);
        add("walk_riverside", 2);
        add("do_work", -2);
      } else if (riskTolerance > 70) {
        add("do_work", 6);
        add("socialize_riverside", 3);
      } else {
        add("do_work", 4);
      }
      if (/记者/.test(role)) add("do_work", 7);
      else if (/医生/.test(role)) add("do_work", 7);
      else if (/主理人|市集协办/.test(role)) add("do_work", 6);
      else if (/配送员/.test(role)) add("do_work", 4);
      else if (/店主/.test(role)) add("do_work", 4);
      add("walk_riverside", -8);
      add("socialize_riverside", -4);
    } else if (kind === "community") {
      if (sociability >= 60) add("socialize_riverside", 5);
      else add("socialize_riverside", 2);
      if (/记者|主理人|市集协办/.test(role)) add("do_work", 4);
    }
  }
  return influence;
}

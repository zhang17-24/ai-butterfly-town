import type { Npc } from "@ai-town/shared";

/** 一句闲聊:谁对谁说了什么。 */
export interface NpcDialogueLine {
  speakerId: string;
  listenerId: string;
  line: string;
}

export interface SocializeOptions {
  /** 随机源(测试注入);默认 Math.random。 */
  rng?: () => number;
  /** 每个世界每个 tick 最多产出几组对话,默认 2。 */
  maxExchanges?: number;
  /** 空闲配对后触发闲聊的概率,默认 0.35。 */
  chance?: number;
}

type SmallTalkTopic = "market" | "weather" | "greeting";

const TOPICS: SmallTalkTopic[] = ["market", "weather", "greeting"];

/** 每个 NPC 的「开场 / 回应」台词。以稳定人格语言组织,保证演示时自然。 */
const NPC_LINES: Record<string, { intro: Record<SmallTalkTopic, string>; reply: Record<SmallTalkTopic, string> }> = {
  npc_lin_xia: {
    intro: {
      market: "市集的事我重新编排了一遍，人手还是紧。",
      weather: "预报说下午有雨，我正把露天摊位往里挪。",
      greeting: "这么巧。你那边工序收尾得怎么样了？",
    },
    reply: {
      market: "那就好。先把任务和截点写清楚，我心里才有底。",
      weather: "稳妥起见，我把人员安全也排进去，别赶着出事。",
      greeting: "还行，都在按计划走。你呢？",
    },
  },
  npc_shen_zhiheng: {
    intro: {
      market: "摊位边最好留个急救位，人一多容易磕碰。",
      weather: "雨天路面湿滑，你那边最好提前准备防滑垫。",
      greeting: "希望今天一切顺利。你脸色还行，但别硬撑。",
    },
    reply: {
      market: "我记下了。急救物资我今天就清点一遍。",
      weather: "对，安全比进度重要。有不适随时叫我。",
      greeting: "都好。我自己会注意，你别熬太晚。",
    },
  },
  npc_he_jianguo: {
    intro: {
      market: "这趟市集货我备得差不多了，就等天了。",
      weather: "要是真下雨，易腐的得先挪回库，别糟蹋。",
      greeting: "去买东西？要什么、多少，我给你算清楚。",
    },
    reply: {
      market: "成，先把账说定，别回头扯皮。",
      weather: "真要下，我就提前调货，损失得算明白。",
      greeting: "你要多少、什么时候用？",
    },
  },
  npc_zhou_fang: {
    intro: {
      market: "东线路我走过一遍，雨天也能绕。要送货说一声。",
      weather: "河边那段下雨肯定堵，我早备了条备用路线。",
      greeting: "嗨，带路不？我在附近正好顺路。",
    },
    reply: {
      market: "行，那我先探路，别到时候堵在半道。",
      weather: "那就按备线走，早出发。",
      greeting: "顺路我就搭把手。",
    },
  },
  npc_tang_yucheng: {
    intro: {
      market: "我正整理市集报道，谁负责、风险几何，都得核实。",
      weather: "暴雨消息我先对气象来源，别传成停办。",
      greeting: "你好。有新鲜消息吗？我会记来源。",
    },
    reply: {
      market: "好，那你把负责人告诉我，我好归档。",
      weather: "先求证再说，我习惯从源头核验。",
      greeting: "好，有进展就记我本子上。",
    },
  },
};

const FALLBACK: { intro: string; reply: string } = {
  intro: "今天怎么样？",
  reply: "还行，都按计划走。",
};

function speak(npc: Npc, side: "intro" | "reply", topic: SmallTalkTopic): string {
  return (NPC_LINES[npc.profile.id]?.[side]?.[topic] ?? FALLBACK[side]);
}

function groupByLocation(npcs: Npc[]): Map<string, Npc[]> {
  const groups = new Map<string, Npc[]>();
  for (const npc of npcs) {
    const list = groups.get(npc.state.locationId);
    if (list) list.push(npc);
    else groups.set(npc.state.locationId, [npc]);
  }
  return groups;
}

function pickPair(group: Npc[], rng: () => number): [Npc, Npc] {
  // 偏移量取 [1, group.length-1],保证 b !== a,且对退化随机源(恒定值)也能终止。
  const aIndex = Math.floor(rng() * group.length);
  const offset = 1 + Math.floor(rng() * (group.length - 1));
  return [group[aIndex], group[(aIndex + offset) % group.length]];
}

/**
 * 让同一地点、且刚好空闲(行动已结束)的两名居民偶尔互聊一两句。
 * 纯函数、可注入随机源;匹配「玩家对话」的对话事件类型 npc.dialogue,供前端渲染头部气泡。
 */
export function maybeSocialize(
  npcs: Npc[],
  gameMinute: number,
  options: SocializeOptions = {},
): NpcDialogueLine[][] {
  const rng = options.rng ?? Math.random;
  const maxExchanges = options.maxExchanges ?? 2;
  const chance = options.chance ?? 0.35;
  const idle = npcs.filter((npc) => npc.state.actionEndsAtMinute <= gameMinute);
  const exchanges: NpcDialogueLine[][] = [];
  for (const group of groupByLocation(idle).values()) {
    if (exchanges.length >= maxExchanges) break;
    if (group.length < 2) continue;
    if (rng() > chance) continue;
    const [a, b] = pickPair(group, rng);
    const topic = TOPICS[Math.floor(rng() * TOPICS.length)];
    exchanges.push([
      { speakerId: a.profile.id, listenerId: b.profile.id, line: speak(a, "intro", topic) },
      { speakerId: b.profile.id, listenerId: a.profile.id, line: speak(b, "reply", topic) },
    ]);
  }
  return exchanges;
}

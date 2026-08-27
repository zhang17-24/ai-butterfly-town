import type { WorldBlueprint } from "@ai-town/shared";
import type { CausalEventSpec, EventAudience } from "./event-propagation.js";

export interface EventPreviewResult {
  preview: CausalEventSpec;
  confidence: number;
  matchedTerms: {
    type?: string;
    locationId?: string;
    minute?: number;
    audience?: EventAudience;
  };
}

const TYPE_TERMS: Array<{ id: string; terms: string[] }> = [
  { id: "weather_alert", terms: ["暴雨", "雷雨", "台风", "洪水", "大风", "降温", "高温", "雨雪"] },
  { id: "emergency", terms: ["火灾", "停电", "停水", "事故", "伤", "病人", "急救", "失窃", "走失"] },
  { id: "market_incident", terms: ["市集", "摊位", "集市", "供货", "缺货", "库存", "售罄", "断货"] },
  { id: "social_incident", terms: ["吵架", "争执", "纠纷", "和解", "留言", "表白", "失约"] },
  { id: "notice", terms: ["公告", "通知", "通报", "消息", "发布"] },
  { id: "community_event", terms: ["活动", "演出", "比赛", "讲座", "聚会", "清理", "修缮"] },
];

const LOCATION_ALIASES: Array<{ id: string; terms: string[] }> = [
  { id: "cafe", terms: ["咖啡馆", "咖啡店", "栖岸咖啡"] },
  { id: "clinic", terms: ["诊所", "医院", "安宁诊所"] },
  { id: "grocery", terms: ["杂货铺", "杂货店", "小店", "老何"] },
  { id: "community", terms: ["社区中心", "活动中心"] },
  { id: "apartment", terms: ["公寓", "宿舍", "住家"] },
  { id: "riverside", terms: ["河岸", "市集", "广场", "河边", "滨河"] },
];

const PUBLIC_TERMS = ["全镇", "全体", "广播", "公告", "预警", "警报", "通知", "所有居民", "所有人"];
const PRIVATE_TERMS = ["私下", "悄悄", "只告诉", "偷偷", "秘密", "仅", "不让", "别声张"];

const DEFAULT_TYPE = "community_event";
const DEFAULT_AUDIENCE: EventAudience = "local";
const DEFAULT_CONFIDENCE = 60;

const CHINESE_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

function chineseNumber(value: string): number | undefined {
  if (/^[0-9]+$/.test(value)) return Number(value);
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (CHINESE_DIGITS[value[1]] ?? 0);
  return CHINESE_DIGITS[value];
}

function adjustByDayPart(hour: number, dayPart: string | undefined): number {
  if (!dayPart) return hour % 24;
  if (dayPart === "下午" || dayPart === "傍晚" || dayPart === "晚上" || dayPart === "夜间") {
    return hour < 12 ? hour + 12 : hour;
  }
  if (dayPart === "早上" || dayPart === "上午" || dayPart === "凌晨") {
    return hour === 12 ? 0 : hour;
  }
  if (dayPart === "中午") {
    return hour === 12 ? 12 : hour < 6 ? hour + 12 : hour;
  }
  return hour % 24;
}

function minuteFromText(text: string): number | undefined {
  const hhmm = /(凌晨|早上|上午|中午|下午|傍晚|晚上|夜间)?\s*(\d{1,2}):(\d{2})\b/.exec(text);
  if (hhmm) {
    const hour = adjustByDayPart(Number(hhmm[2]), hhmm[1]);
    return hour * 60 + Number(hhmm[3]);
  }
  const hourPoint = /(凌晨|早上|上午|中午|下午|傍晚|晚上|夜间)?\s*([0-9]{1,2}|[一二三四五六七八九十]{1,2})点(半)?/.exec(text);
  if (hourPoint) {
    const hourValue = chineseNumber(hourPoint[2]);
    if (hourValue === undefined) return undefined;
    return adjustByDayPart(hourValue, hourPoint[1]) * 60 + (hourPoint[3] ? 30 : 0);
  }
  return undefined;
}

function matchLocation(text: string, blueprint?: WorldBlueprint): string | undefined {
  const knownIds = new Set((blueprint?.locations ?? []).map((location) => location.id));
  const aliasHit = LOCATION_ALIASES.find(
    (alias) => alias.terms.some((term) => text.includes(term)),
  );
  if (aliasHit && (blueprint === undefined || knownIds.has(aliasHit.id))) {
    return aliasHit.id;
  }
  const nameHit = blueprint?.locations.find((location) => text.includes(location.name));
  return nameHit?.id;
}

export function buildEventPreview(
  text: string,
  options?: { nowMinute?: number; blueprint?: WorldBlueprint },
): EventPreviewResult {
  const matchedType = TYPE_TERMS.find((group) => group.terms.some((term) => text.includes(term)));
  const locationId = matchLocation(text, options?.blueprint);
  const minute = minuteFromText(text);
  const audience: EventAudience = PRIVATE_TERMS.some((term) => text.includes(term))
    ? "private"
    : PUBLIC_TERMS.some((term) => text.includes(term))
      ? "public"
      : DEFAULT_AUDIENCE;

  let confidence = DEFAULT_CONFIDENCE;
  if (matchedType) confidence += 10;
  if (locationId) confidence += 15;
  if (minute !== undefined) confidence += 8;
  if (audience !== DEFAULT_AUDIENCE) confidence += 7;

  return {
    preview: {
      id: `preview_${Math.abs(hashOf(text)).toString(36)}`,
      type: matchedType?.id ?? DEFAULT_TYPE,
      summary: text.trim(),
      fact: text.trim(),
      locationId,
      involvedNpcIds: [],
      audience,
      gameMinute: minute ?? options?.nowMinute,
      source: "player",
    },
    confidence: Math.min(100, confidence),
    matchedTerms: {
      type: matchedType?.id,
      locationId,
      minute,
      audience: audience === DEFAULT_AUDIENCE ? undefined : audience,
    },
  };
}

function hashOf(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash;
}

import type { TownEvent } from "@ai-town/shared";

/** 一条「谁说了什么」,供场景在角色头上渲染对话气泡。 */
export interface SpeechLine {
  actorId: string;
  text: string;
  source: string;
}

/** 玩家语气泡的占位 actorId:场景用它定位 playerMarker(玩家 id 是 uuid,非 NPC)。 */
export const SPEECH_PLAYER_ACTOR = "__player__";

function payloadOf(event: TownEvent): Record<string, unknown> {
  return event.payload ?? {};
}

/**
 * 从实时事件中提取对话内容。
 * - dialogue.message(玩家↔NPC):玩家说话 + NPC 回复各一条;
 * - npc.dialogue(NPC 闲聊):说话者一条。
 */
export function toSpeechLines(event: TownEvent): SpeechLine[] {
  const payload = payloadOf(event);
  if (event.type === "dialogue.message") {
    const lines: SpeechLine[] = [];
    if (typeof payload.message === "string") {
      lines.push({ actorId: SPEECH_PLAYER_ACTOR, text: payload.message, source: "player" });
    }
    if (typeof payload.npcId === "string" && typeof payload.reply === "string") {
      lines.push({ actorId: payload.npcId, text: payload.reply, source: event.source });
    }
    return lines;
  }
  if (event.type === "npc.dialogue") {
    if (typeof payload.speakerId === "string" && typeof payload.line === "string") {
      return [{ actorId: payload.speakerId, text: payload.line, source: event.source }];
    }
    return [];
  }
  return [];
}

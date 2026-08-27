import { create } from "zustand";
import type { DialogueEndResult, DialogueStartResult, EventCommitResult, Npc, Player, PlayerMoveResult, Position, RealtimeMessage, TownEvent, WorldSummary } from "@ai-town/shared";

interface WorldStore {
  world: WorldSummary | null;
  npcs: Npc[];
  player: Player | null;
  playerPath: Position[];
  events: TownEvent[];
  connected: boolean;
  selectedNpcId: string | null;
  setConnected(connected: boolean): void;
  setSelectedNpc(id: string | null): void;
  applyPlayerMove(result: PlayerMoveResult): void;
  applyDialogueStart(result: DialogueStartResult): void;
  applyEvent(result: EventCommitResult): void;
  applyDialogueEnd(result: DialogueEndResult): void;
  applyMessage(message: RealtimeMessage): void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  npcs: [],
  player: null,
  playerPath: [],
  events: [],
  connected: false,
  selectedNpcId: null,
  setConnected: (connected) => set({ connected }),
  setSelectedNpc: (selectedNpcId) => set({ selectedNpcId }),
  applyPlayerMove: (result) => set((state) => ({
    player: result.player,
    playerPath: result.path,
    world: result.world,
    events: dedupeEvents([...state.events, result.event]).slice(-40),
  })),
  applyDialogueStart: (result) => set((state) => ({
    player: result.player,
    playerPath: result.path,
    world: result.world,
    npcs: state.npcs.map((npc) => npc.profile.id === result.npc.profile.id ? result.npc : npc),
    events: dedupeEvents([...state.events, result.event]).slice(-40),
  })),
  applyDialogueEnd: (result) => set((state) => ({
    world: result.world,
    npcs: state.npcs.map((npc) => npc.profile.id === result.npc.profile.id ? result.npc : npc),
    events: dedupeEvents([...state.events, result.event]).slice(-40),
  })),
  applyEvent: (result) => set((state) => ({
    world: result.world,
    events: dedupeEvents([...state.events, result.event]).slice(-40),
  })),
  applyMessage: (message) => set((state) => {
    if (message.type === "world.snapshot") {
      return { world: message.data.world, player: message.data.player, playerPath: [], npcs: message.data.npcs, events: dedupeEvents(message.data.recentEvents) };
    }
    if (message.type === "world.catchup") {
      return {
        world: message.data.state.world,
        player: message.data.state.player,
        npcs: message.data.state.npcs,
        events: dedupeEvents([...state.events, ...message.data.state.recentEvents, ...message.data.events]).slice(-40),
      };
    }
    if (state.world && message.version <= state.world.version) return state;
    if (message.type === "world.status") return {
      world: message.data,
      events: message.event ? dedupeEvents([...state.events, message.event]).slice(-40) : state.events,
    };
    return {
      world: state.world ? {
        ...state.world,
        gameMinute: message.data.gameMinute,
        version: message.data.version,
      } : state.world,
      npcs: message.data.npcs,
      events: dedupeEvents([...state.events, ...message.data.events]).slice(-40),
    };
  }),
}));

function dedupeEvents(events: TownEvent[]): TownEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

import { create } from "zustand";
import type { Npc, RealtimeMessage, TownEvent, WorldSummary } from "@ai-town/shared";

interface WorldStore {
  world: WorldSummary | null;
  npcs: Npc[];
  events: TownEvent[];
  connected: boolean;
  selectedNpcId: string | null;
  setConnected(connected: boolean): void;
  setSelectedNpc(id: string | null): void;
  applyMessage(message: RealtimeMessage): void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  npcs: [],
  events: [],
  connected: false,
  selectedNpcId: null,
  setConnected: (connected) => set({ connected }),
  setSelectedNpc: (selectedNpcId) => set({ selectedNpcId }),
  applyMessage: (message) => set((state) => {
    if (message.type === "world.snapshot") {
      return { world: message.data.world, npcs: message.data.npcs, events: dedupeEvents(message.data.recentEvents) };
    }
    if (message.type === "world.status") return { world: message.data };
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

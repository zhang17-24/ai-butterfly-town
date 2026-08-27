import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const NpcProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int(),
  role: z.string(),
  color: z.string(),
  personality: z.string(),
  motivation: z.string(),
  preferences: z.array(z.string()),
  dislikes: z.array(z.string()),
  traits: z.object({
    sociability: z.number().min(0).max(100),
    conscientiousness: z.number().min(0).max(100),
    curiosity: z.number().min(0).max(100),
    riskTolerance: z.number().min(0).max(100),
  }),
});

export const NpcStateSchema = z.object({
  npcId: z.string(),
  locationId: z.string(),
  position: PositionSchema,
  currentAction: z.string(),
  actionReason: z.string(),
  actionEndsAtMinute: z.number().int(),
  hunger: z.number().min(0).max(100),
  energy: z.number().min(0).max(100),
  mood: z.number().min(0).max(100),
  stress: z.number().min(0).max(100),
  social: z.number().min(0).max(100),
});

export const NpcSchema = z.object({
  profile: NpcProfileSchema,
  state: NpcStateSchema,
});

export const TownEventSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  version: z.number().int(),
  gameMinute: z.number().int(),
  type: z.string(),
  actorId: z.string().nullable(),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const WorldSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  gameMinute: z.number().int(),
  version: z.number().int(),
  paused: z.boolean(),
  npcCount: z.number().int(),
});

export const WorldStateSchema = z.object({
  world: WorldSummarySchema,
  npcs: z.array(NpcSchema),
  recentEvents: z.array(TownEventSchema),
});

export const RealtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("world.snapshot"), data: WorldStateSchema }),
  z.object({
    type: z.literal("world.tick"),
    data: z.object({
      worldId: z.string(),
      gameMinute: z.number().int(),
      version: z.number().int(),
      npcs: z.array(NpcSchema),
      events: z.array(TownEventSchema),
    }),
  }),
  z.object({ type: z.literal("world.status"), data: WorldSummarySchema }),
]);

export type Position = z.infer<typeof PositionSchema>;
export type NpcProfile = z.infer<typeof NpcProfileSchema>;
export type NpcState = z.infer<typeof NpcStateSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type TownEvent = z.infer<typeof TownEventSchema>;
export type WorldSummary = z.infer<typeof WorldSummarySchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;


import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const AppErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});

export const ActionIntentSchema = z.object({
  actionId: z.string().min(1),
  actorId: z.string().min(1),
  targetIds: z.array(z.string()).optional(),
  locationId: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().min(1),
  expectedWorldVersion: z.number().int().nonnegative(),
});

export const ActionDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  interruptibility: z.enum(["free", "important", "emergency_only"]),
  requiredCapabilities: z.array(z.string()).default([]),
  parameterSchemaId: z.string(),
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
  branchId: z.string(),
  version: z.number().int(),
  gameMinute: z.number().int(),
  type: z.string(),
  actorId: z.string().nullable(),
  summary: z.string(),
  source: z.enum(["system", "player", "ai", "mock"]),
  causeIds: z.array(z.string()),
  schemaVersion: z.number().int().positive(),
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
  activeBranchId: z.string(),
  npcCount: z.number().int(),
});

export const WorldStateSchema = z.object({
  world: WorldSummarySchema,
  npcs: z.array(NpcSchema),
  recentEvents: z.array(TownEventSchema),
});

export const WorldBranchSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  parentBranchId: z.string().nullable(),
  forkEventId: z.string().nullable(),
  headVersion: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const SnapshotMetadataSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  branchId: z.string(),
  version: z.number().int().nonnegative(),
  gameMinute: z.number().int().nonnegative(),
  reason: z.string(),
  checksum: z.string(),
  createdAt: z.string(),
});

const RealtimeEnvelopeShape = {
  eventId: z.string(),
  worldId: z.string(),
  branchId: z.string(),
  version: z.number().int().nonnegative(),
  emittedAt: z.string(),
};

export const RealtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...RealtimeEnvelopeShape, type: z.literal("world.snapshot"), data: WorldStateSchema }),
  z.object({
    ...RealtimeEnvelopeShape,
    type: z.literal("world.catchup"),
    data: z.object({
      fromVersion: z.number().int().nonnegative(),
      state: WorldStateSchema,
      events: z.array(TownEventSchema),
    }),
  }),
  z.object({
    ...RealtimeEnvelopeShape,
    type: z.literal("world.tick"),
    data: z.object({
      worldId: z.string(),
      gameMinute: z.number().int(),
      version: z.number().int(),
      npcs: z.array(NpcSchema),
      events: z.array(TownEventSchema),
    }),
  }),
  z.object({
    ...RealtimeEnvelopeShape,
    type: z.literal("world.status"),
    data: WorldSummarySchema,
    event: TownEventSchema.nullable(),
  }),
]);

export type Position = z.infer<typeof PositionSchema>;
export type AppError = z.infer<typeof AppErrorSchema>;
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
export type NpcProfile = z.infer<typeof NpcProfileSchema>;
export type NpcState = z.infer<typeof NpcStateSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type TownEvent = z.infer<typeof TownEventSchema>;
export type WorldSummary = z.infer<typeof WorldSummarySchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type WorldBranch = z.infer<typeof WorldBranchSchema>;
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;

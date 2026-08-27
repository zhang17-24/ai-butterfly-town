import { z } from "zod";

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const PixelStyleSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  projection: z.literal("top_down_90"),
  pixelScale: z.number().int().min(1).max(8),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(4).max(16),
  lighting: z.string().min(1),
  buildingLanguage: z.string().min(1),
  characterLanguage: z.string().min(1),
  locked: z.literal(true),
});

export const BlueprintLocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["building", "plaza", "outdoor", "water"]),
  bounds: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  entrances: z.array(PositionSchema),
  capabilities: z.array(z.string()),
});

export const BlueprintPathSchema = z.object({
  id: z.string().min(1),
  width: z.number().positive(),
  points: z.array(PositionSchema).min(2),
});

export const WorldBlueprintSchema = z.object({
  schemaVersion: z.literal(1),
  worldId: z.string().min(1),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileSize: z.number().int().positive(),
  }),
  locations: z.array(BlueprintLocationSchema).min(2),
  paths: z.array(BlueprintPathSchema).min(1),
  spawnPoints: z.array(z.object({ id: z.string(), position: PositionSchema })).min(1),
});

export const VisualReviewSchema = z.object({
  verdict: z.enum(["pass", "retry", "fallback"]),
  score: z.number().min(0).max(100),
  issueCodes: z.array(z.enum([
    "PROJECTION_DRIFT",
    "LAYOUT_MISMATCH",
    "BLOCKED_ENTRANCE",
    "DISCONNECTED_PATH",
    "STYLE_DRIFT",
    "TEXT_OR_PEOPLE_PRESENT",
    "FRAME_LAYOUT_MISMATCH",
    "BACKGROUND_NOT_TRANSPARENT",
    "IDENTITY_DRIFT",
    "CLIPPED_SPRITE",
  ])),
  feedback: z.array(z.string()),
});

export const MapAssetManifestSchema = z.object({
  worldId: z.string(),
  blueprintVersion: z.number().int().positive(),
  blueprintHash: z.string(),
  styleSpecId: z.string(),
  imageUrl: z.string(),
  source: z.enum(["ai", "prebuilt", "procedural"]),
  review: VisualReviewSchema,
});

export const CharacterVisualSpecSchema = z.object({
  npcId: z.string().min(1),
  appearance: z.string().min(1),
  columns: z.literal(6),
  rows: z.literal(5),
  rowSemantics: z.tuple([
    z.literal("walk_left"),
    z.literal("walk_front"),
    z.literal("walk_back"),
    z.literal("idle_front"),
    z.literal("expressions"),
  ]),
  transparentBackground: z.literal(true),
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

export const DecisionCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number(),
  reason: z.string(),
  destinationId: z.string(),
  durationMinutes: z.number().int().positive(),
});

export const DecisionOutputSchema = z.object({
  actionId: z.string().min(1),
  reason: z.string().min(1).max(240),
});

export const AiTraceSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  branchId: z.string(),
  worldVersion: z.number().int().nonnegative(),
  agentId: z.string(),
  role: z.literal("SIMULATION"),
  status: z.enum(["success", "fallback"]),
  source: z.enum(["ai", "mock"]),
  provider: z.string(),
  model: z.string(),
  context: z.record(z.string(), z.unknown()),
  candidates: z.array(DecisionCandidateSchema),
  rawOutput: z.unknown().nullable(),
  validationErrors: z.array(z.string()),
  fallbackReason: z.string().nullable(),
  finalActionId: z.string(),
  finalReason: z.string(),
  latencyMs: z.number().nonnegative(),
  attempts: z.number().int().positive(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }),
  stateChanges: z.record(z.string(), z.object({ before: z.number(), after: z.number() })),
  createdAt: z.string(),
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
export type PixelStyleSpec = z.infer<typeof PixelStyleSpecSchema>;
export type BlueprintLocation = z.infer<typeof BlueprintLocationSchema>;
export type BlueprintPath = z.infer<typeof BlueprintPathSchema>;
export type WorldBlueprint = z.infer<typeof WorldBlueprintSchema>;
export type VisualReview = z.infer<typeof VisualReviewSchema>;
export type MapAssetManifest = z.infer<typeof MapAssetManifestSchema>;
export type CharacterVisualSpec = z.infer<typeof CharacterVisualSpecSchema>;
export type AppError = z.infer<typeof AppErrorSchema>;
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;
export type AiTrace = z.infer<typeof AiTraceSchema>;
export type NpcProfile = z.infer<typeof NpcProfileSchema>;
export type NpcState = z.infer<typeof NpcStateSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type TownEvent = z.infer<typeof TownEventSchema>;
export type WorldSummary = z.infer<typeof WorldSummarySchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type WorldBranch = z.infer<typeof WorldBranchSchema>;
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;

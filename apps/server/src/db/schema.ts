import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  gameMinute: integer("game_minute").notNull().default(500),
  version: integer("version").notNull().default(1),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  activeBranchId: text("active_branch_id"),
  updatedAt: text("updated_at").notNull(),
});

export const worldBranches = sqliteTable("world_branches", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  parentBranchId: text("parent_branch_id"),
  forkEventId: text("fork_event_id"),
  headVersion: integer("head_version").notNull(),
  createdAt: text("created_at").notNull(),
});

export const npcs = sqliteTable("npcs", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  profileJson: text("profile_json").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  positionJson: text("position_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  branchId: text("branch_id"),
  version: integer("version").notNull(),
  gameMinute: integer("game_minute").notNull(),
  type: text("type").notNull(),
  actorId: text("actor_id"),
  summary: text("summary").notNull(),
  source: text("source").notNull().default("system"),
  causeIdsJson: text("cause_ids_json").notNull().default("[]"),
  schemaVersion: integer("schema_version").notNull().default(1),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  branchId: text("branch_id").notNull(),
  version: integer("version").notNull(),
  gameMinute: integer("game_minute").notNull(),
  reason: text("reason").notNull(),
  stateJson: text("state_json").notNull(),
  checksum: text("checksum").notNull(),
  createdAt: text("created_at").notNull(),
});

export const commandReceipts = sqliteTable("command_receipts", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  worldId: text("world_id").notNull(),
  commandType: text("command_type").notNull(),
  baseVersion: integer("base_version").notNull(),
  committedVersion: integer("committed_version").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  sourceAgentId: text("source_agent_id").notNull(),
  targetAgentId: text("target_agent_id").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  agentId: text("agent_id").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const knowledge = sqliteTable("knowledge", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  agentId: text("agent_id").notNull(),
  factJson: text("fact_json").notNull(),
  sourceEventId: text("source_event_id"),
  confidence: integer("confidence").notNull(),
  createdAt: text("created_at").notNull(),
});

export const aiTraces = sqliteTable("ai_traces", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  branchId: text("branch_id").notNull(),
  agentId: text("agent_id"),
  role: text("role").notNull(),
  status: text("status").notNull(),
  traceJson: text("trace_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const dialogueSessions = sqliteTable("dialogue_sessions", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  playerId: text("player_id").notNull(),
  npcId: text("npc_id").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});

export const dialogueMessages = sqliteTable("dialogue_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  speakerId: text("speaker_id").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});

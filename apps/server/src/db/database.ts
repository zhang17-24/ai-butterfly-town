import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  game_minute INTEGER NOT NULL DEFAULT 500,
  version INTEGER NOT NULL DEFAULT 1,
  paused INTEGER NOT NULL DEFAULT 0,
  active_branch_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worlds_user ON worlds(user_id);
CREATE TABLE IF NOT EXISTS npcs (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_npcs_world ON npcs(world_id);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_world_user ON players(world_id, user_id);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  branch_id TEXT,
  version INTEGER NOT NULL,
  game_minute INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  summary TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  cause_ids_json TEXT NOT NULL DEFAULT '[]',
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_world_version ON events(world_id, version DESC);
CREATE TABLE IF NOT EXISTS world_branches (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  parent_branch_id TEXT,
  fork_event_id TEXT,
  head_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_branches_world ON world_branches(world_id);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  game_minute INTEGER NOT NULL,
  reason TEXT NOT NULL,
  state_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_branch_version ON snapshots(branch_id, version);
CREATE TABLE IF NOT EXISTS command_receipts (
  idempotency_key TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  committed_version INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_command_receipts_world ON command_receipts(world_id);
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_direction ON relationships(world_id, source_agent_id, target_agent_id);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(world_id, agent_id, created_at DESC);
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  fact_json TEXT NOT NULL,
  source_event_id TEXT,
  confidence INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON knowledge(world_id, agent_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ai_traces (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  agent_id TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  trace_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_traces_world ON ai_traces(world_id, created_at DESC);
CREATE TABLE IF NOT EXISTS dialogue_sessions (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dialogue_sessions_world ON dialogue_sessions(world_id, started_at DESC);
CREATE TABLE IF NOT EXISTS dialogue_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dialogue_messages_session ON dialogue_messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  world_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  progress_json TEXT,
  error TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
`;

// 迁移:schema 演进(幂等)。worlds 历史行保持 NULL = 内置栖溪镇默认为权威(qixi)。
function ensureColumn(sqlite: Database.Database, table: string, column: string, definition: string): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export interface DatabaseHandle {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close(): void;
}

export function openDatabase(databasePath: string): DatabaseHandle {
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(MIGRATION_SQL);
  ensureColumn(sqlite, "worlds", "active_branch_id", "TEXT");
  ensureColumn(sqlite, "worlds", "blueprint_json", "TEXT");
  ensureColumn(sqlite, "worlds", "rules_json", "TEXT");
  ensureColumn(sqlite, "worlds", "asset_json", "TEXT");
  ensureColumn(sqlite, "worlds", "map_png_b64", "TEXT");
  ensureColumn(sqlite, "worlds", "gen_seed", "INTEGER");
  ensureColumn(sqlite, "events", "branch_id", "TEXT");
  ensureColumn(sqlite, "events", "source", "TEXT NOT NULL DEFAULT 'system'");
  ensureColumn(sqlite, "events", "cause_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(sqlite, "events", "schema_version", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(sqlite, "memories", "world_minute", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "memories", "importance", "INTEGER NOT NULL DEFAULT 40");
  ensureColumn(sqlite, "memories", "subject", "TEXT");
  ensureColumn(sqlite, "memories", "source_identifier", "TEXT");
  ensureColumn(sqlite, "memories", "is_archived", "INTEGER NOT NULL DEFAULT 0");
  sqlite.exec(`UPDATE memories SET source_identifier = kind || ':' || world_id || ':' || agent_id || ':' || id WHERE source_identifier IS NULL OR source_identifier = ''`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_memories_agent_imp ON memories(world_id, agent_id, importance DESC)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_branch_version ON snapshots(branch_id, version)`);
  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

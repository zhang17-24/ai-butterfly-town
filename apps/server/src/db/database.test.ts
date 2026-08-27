import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("database migrations", () => {
  it("adds M2 columns to an existing day-one database without deleting data", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-town-m2-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "legacy.db");
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE worlds (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
        game_minute INTEGER NOT NULL DEFAULT 500, version INTEGER NOT NULL DEFAULT 1,
        paused INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
      );
      CREATE TABLE events (
        id TEXT PRIMARY KEY, world_id TEXT NOT NULL, version INTEGER NOT NULL, game_minute INTEGER NOT NULL,
        type TEXT NOT NULL, actor_id TEXT, summary TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO worlds VALUES ('legacy-world', 'legacy-user', '旧世界', '保留我', 510, 7, 0, '2026-01-01');
      INSERT INTO events VALUES ('legacy-event', 'legacy-world', 7, 510, 'legacy', NULL, '旧事件', '{}', '2026-01-01');
    `);
    legacy.close();

    const migrated = openDatabase(databasePath);
    const worldColumns = migrated.sqlite.prepare("PRAGMA table_info(worlds)").all() as Array<{ name: string }>;
    const eventColumns = migrated.sqlite.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
    const playerTable = migrated.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'").get();
    expect(worldColumns.map((column) => column.name)).toContain("active_branch_id");
    expect(eventColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["branch_id", "source", "cause_ids_json", "schema_version"]));
    expect(playerTable).toEqual({ name: "players" });
    expect(migrated.sqlite.prepare("SELECT description, version FROM worlds WHERE id = ?").get("legacy-world")).toEqual({ description: "保留我", version: 7 });
    expect(migrated.sqlite.prepare("SELECT summary FROM events WHERE id = ?").get("legacy-event")).toEqual({ summary: "旧事件" });
    migrated.close();
  });
});

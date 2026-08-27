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
  updatedAt: text("updated_at").notNull(),
});

export const npcs = sqliteTable("npcs", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  profileJson: text("profile_json").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  version: integer("version").notNull(),
  gameMinute: integer("game_minute").notNull(),
  type: text("type").notNull(),
  actorId: text("actor_id"),
  summary: text("summary").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});


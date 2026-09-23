import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema mirroring schema.sql (the SQL contract). Keep the two in
 * sync — schema.sql is the canonical definition, this file is the typed
 * client for the app.
 */

export const betaModStatus = pgEnum("beta_mod_status", [
  "alpha",
  "beta",
  "rc",
  "promoted",
  "abandoned",
]);

export const bugSeverity = pgEnum("bug_severity", ["minor", "major", "blocking"]);

export const bugStatus = pgEnum("bug_status", ["open", "acknowledged", "fixed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  nexusUserId: text("nexus_user_id").unique(),
  // Local sign-in fallback for the pre-SSO period; null for SSO-only accounts.
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const betaMods = pgTable("beta_mods", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description"), // plain/markdown, NOT BBCode
  game: text("game").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  status: betaModStatus("status").notNull().default("alpha"),
  // Set when the author confirms promotion — the live Nexus page this mod
  // now lives on. The beta page becomes read-only and links here.
  nexusUrl: text("nexus_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const builds = pgTable("builds", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaModId: uuid("beta_mod_id")
    .notNull()
    .references(() => betaMods.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(),
  fileUrl: text("file_url").notNull(),
  changelog: text("changelog"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bugReports = pgTable("bug_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaModId: uuid("beta_mod_id")
    .notNull()
    .references(() => betaMods.id, { onDelete: "cascade" }),
  buildId: uuid("build_id").references(() => builds.id),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id),
  severity: bugSeverity("severity").notNull(),
  description: text("description").notNull(),
  reproSteps: text("repro_steps"),
  attachmentUrl: text("attachment_url"),
  status: bugStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readySignals = pgTable(
  "ready_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betaModId: uuid("beta_mod_id")
      .notNull()
      .references(() => betaMods.id, { onDelete: "cascade" }),
    testerId: uuid("tester_id")
      .notNull()
      .references(() => users.id),
    isReady: boolean("is_ready").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("ready_signals_beta_mod_id_tester_id_unique").on(table.betaModId, table.testerId)],
);

export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaModId: uuid("beta_mod_id")
    .notNull()
    .references(() => betaMods.id, { onDelete: "cascade" }),
  nexusModName: text("nexus_mod_name").notNull(),
  nexusModUrl: text("nexus_mod_url"),
});

export const nexusLinks = pgTable("nexus_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  nexusApiKeyEncrypted: text("nexus_api_key_encrypted").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type BetaMod = typeof betaMods.$inferSelect;
export type Build = typeof builds.$inferSelect;
export type BugReport = typeof bugReports.$inferSelect;
export type ReadySignal = typeof readySignals.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
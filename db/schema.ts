import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export const mediaScanState = pgEnum("media_scan_state", ["clean", "rejected"]);

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
  buildId: uuid("build_id").notNull().references(() => builds.id),
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
    // Migration 0002 backfills existing rows to the newest build and keeps
    // any truly unscoped legacy row readable; all new writes require a build.
    buildId: uuid("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    testerId: uuid("tester_id")
      .notNull()
      .references(() => users.id),
    isReady: boolean("is_ready").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("ready_signals_build_id_tester_id_unique").on(
      table.buildId,
      table.testerId,
    ),
  ],
);

export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaModId: uuid("beta_mod_id")
    .notNull()
    .references(() => betaMods.id, { onDelete: "cascade" }),
  nexusModName: text("nexus_mod_name").notNull(),
  nexusModUrl: text("nexus_mod_url"),
});

export const modMedia = pgTable(
  "mod_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betaModId: uuid("beta_mod_id")
      .notNull()
      .references(() => betaMods.id, { onDelete: "cascade" }),
    // Final storage key (R2 in production): media/<modId>/<uuid>.<ext>.
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: bigint("width", { mode: "number" }).notNull(),
    height: bigint("height", { mode: "number" }).notNull(),
    // Gallery order, ascending. New uploads get max(position)+1; moves swap.
    position: bigint("position", { mode: "number" }).notNull().default(0),
    caption: text("caption"),
    // At most one per mod (partial unique index in the SQL contract). The hero
    // is what Browse cards show and the gallery starts on.
    isHero: boolean("is_hero").notNull().default(false),
    // Rows are only ever created after a clean scan — see lib/mod-media.ts.
    scanState: mediaScanState("scan_state").notNull().default("clean"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mod_media_beta_mod_id_idx").on(table.betaModId),
    unique("mod_media_position_unique").on(table.betaModId, table.position),
    uniqueIndex("mod_media_one_hero_per_mod")
      .on(table.betaModId)
      .where(sql`is_hero`),
  ],
);

export const nexusLinks = pgTable("nexus_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  nexusApiKeyEncrypted: text("nexus_api_key_encrypted").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Pilot control plane (see lib/pilot.ts for the limits these enforce) ---

export const storageReservationState = pgEnum("storage_reservation_state", [
  "held",
  "stored",
  "released",
]);

/**
 * Byte ledger behind the pilot storage caps. An upload takes a `held` row
 * before a single byte is stored; `stored` rows are what the admin console
 * reports as used, `held` as reserved, and `released` rows are the attempt
 * history the rate limit reads (and are not counted against any cap).
 */
export const storageReservations = pgTable(
  "storage_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Deleting a build (directly, or by deleting its mod) releases its bytes.
    buildId: uuid("build_id").references(() => builds.id, { onDelete: "cascade" }),
    // Media uploads settle against a mod_media row instead; deleting that row
    // releases its bytes the same way. Exactly one of buildId / mediaId is set
    // by the settle step.
    mediaId: uuid("media_id").references(() => modMedia.id, { onDelete: "cascade" }),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    state: storageReservationState("state").notNull().default("held"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("storage_reservations_user_id_idx").on(table.userId),
    index("storage_reservations_state_idx").on(table.state),
    index("storage_reservations_media_id_idx").on(table.mediaId),
  ],
);

/** Upload approvals while `PILOT_MODE=on`. Empty table = nobody can upload. */
export const pilotAccounts = pgTable("pilot_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  approvedBy: text("approved_by"),
  note: text("note"),
  approvedAt: timestamp("approved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Admin-flippable runtime switches. A missing row means the default, so the
 * site never boots frozen because this table is empty.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type BetaMod = typeof betaMods.$inferSelect;
export type Build = typeof builds.$inferSelect;
export type BugReport = typeof bugReports.$inferSelect;
export type ReadySignal = typeof readySignals.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type ModMedia = typeof modMedia.$inferSelect;
export type StorageReservation = typeof storageReservations.$inferSelect;
export type PilotAccount = typeof pilotAccounts.$inferSelect;

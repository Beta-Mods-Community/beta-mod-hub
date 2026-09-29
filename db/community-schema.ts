import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { betaMods, users } from "./schema";

export const modFollows = pgTable("mod_follows", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  betaModId: uuid("beta_mod_id").notNull().references(() => betaMods.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.userId, t.betaModId), index("mod_follows_mod_idx").on(t.betaModId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  href: text("href").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("notifications_user_date_idx").on(t.userId, t.createdAt)]);

export const contentReports = pgTable("content_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  betaModId: uuid("beta_mod_id").notNull().references(() => betaMods.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.reporterId, t.betaModId)]);

export const moderationLog = pgTable("moderation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  targetId: uuid("target_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

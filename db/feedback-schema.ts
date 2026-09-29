import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { betaMods, bugReports, builds, storageReservations, users } from "./schema";

export const bugReportWorkflow = pgTable("bug_report_workflow", {
  reportId: uuid("report_id").primaryKey().references(() => bugReports.id, { onDelete: "cascade" }),
  authorResponse: text("author_response"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  retestStatus: text("retest_status").notNull().default("not-requested"),
  retestBuildId: uuid("retest_build_id").references(() => builds.id, { onDelete: "set null" }),
  retestNotes: text("retest_notes"),
  retestedAt: timestamp("retested_at", { withTimezone: true }),
});

export const bugAttachments = pgTable("bug_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").notNull().references(() => bugReports.id, { onDelete: "cascade" }),
  betaModId: uuid("beta_mod_id").notNull().references(() => betaMods.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").notNull().references(() => users.id),
  reservationId: uuid("reservation_id").notNull().unique().references(() => storageReservations.id),
  objectKey: text("object_key").notNull().unique(),
  filename: text("filename").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  scanState: text("scan_state").notNull().default("clean"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("bug_attachments_mod_idx").on(table.betaModId)]);

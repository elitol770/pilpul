import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// ---------- Tables ----------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  city: text("city"),
  timezone: text("timezone"),
  ageConfirmed: integer("age_confirmed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  textTitle: text("text_title").notNull(),
  pace: text("pace").notNull(),
  commitment: text("commitment").notNull(),
  scheduleWindows: text("schedule_windows"),
  language: text("language").default("English"),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const pairings = sqliteTable("pairings", {
  id: text("id").primaryKey(),
  userAId: text("user_a_id").notNull(),
  userBId: text("user_b_id").notNull(),
  textTitle: text("text_title").notNull(),
  textSource: text("text_source"),
  pace: text("pace"),
  startedAt: text("started_at").default(sql`CURRENT_TIMESTAMP`),
  endedAt: text("ended_at"),
  status: text("status").notNull().default("active"),
  nextSessionAt: text("next_session_at"),
  notebookContent: text("notebook_content").default(""),
  notebookUpdatedAt: text("notebook_updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  pairingId: text("pairing_id").notNull(),
  scheduledAt: text("scheduled_at"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  recap: text("recap"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ---------- Types ----------

export type User = typeof users.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type Pairing = typeof pairings.$inferSelect;
export type StudySession = typeof sessions.$inferSelect;

// ---------- Insert schemas ----------

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertRequestSchema = createInsertSchema(requests)
  .omit({
    id: true,
    userId: true,
    status: true,
    createdAt: true,
  })
  .extend({
    textTitle: z.string().min(1, "What do you want to read?").max(160),
    pace: z.enum(["slow", "medium", "fast"]),
    commitment: z.enum(["casual", "serious"]),
    language: z.string().default("English"),
  });
export type InsertRequest = z.infer<typeof insertRequestSchema>;

export const profileSchema = z.object({
  firstName: z.string().min(1, "Required").max(40),
  city: z.string().min(1, "Required").max(80),
  timezone: z.string().default("UTC"),
  ageConfirmed: z
    .boolean()
    .refine((v) => v === true, "You must confirm you are 18 or older"),
});
export type Profile = z.infer<typeof profileSchema>;

export const claimEmailSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

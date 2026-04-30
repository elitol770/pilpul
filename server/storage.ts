import { users, requests, pairings, sessions } from "@shared/schema";
import type {
  User,
  InsertUser,
  Request as PartnerRequest,
  InsertRequest,
  Pairing,
  StudySession,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, desc, eq, or, sql } from "drizzle-orm";
import crypto from "node:crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Bootstrap schema (no migrations needed for prototype)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  city TEXT,
  timezone TEXT,
  age_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text_title TEXT NOT NULL,
  pace TEXT NOT NULL,
  commitment TEXT NOT NULL,
  schedule_windows TEXT,
  language TEXT DEFAULT 'English',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL,
  user_b_id TEXT NOT NULL,
  text_title TEXT NOT NULL,
  text_source TEXT,
  pace TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  next_session_at TEXT,
  notebook_content TEXT DEFAULT '',
  notebook_updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL,
  scheduled_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  recap TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_pairings_status ON pairings(status);
CREATE INDEX IF NOT EXISTS idx_pairings_users ON pairings(user_a_id, user_b_id);
`);

export const db = drizzle(sqlite);

const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export interface IStorage {
  // users
  getUser(id: string): User | undefined;
  getUserByEmail(email: string): User | undefined;
  upsertUserByEmail(email: string): User;
  updateUserProfile(
    id: string,
    profile: { firstName: string; city: string; timezone: string; ageConfirmed: boolean }
  ): User | undefined;

  // requests
  createRequest(userId: string, data: InsertRequest): PartnerRequest;
  getOpenRequests(): PartnerRequest[];
  getUserOpenRequest(userId: string): PartnerRequest | undefined;
  closeRequest(id: string): void;
  countOpenRequests(): number;

  // pairings
  createPairing(args: {
    userAId: string;
    userBId: string;
    textTitle: string;
    pace?: string | null;
    textSource?: string | null;
  }): Pairing;
  getActivePairingForUser(userId: string): Pairing | undefined;
  getPairingsForUser(userId: string): Pairing[];
  getPairing(id: string): Pairing | undefined;
  updateNotebook(pairingId: string, content: string): Pairing | undefined;
  endPairing(id: string, status: "completed" | "dissolved"): void;
  countActivePairings(): number;
  countCompletedThisWeek(): number;

  // sessions
  createSession(pairingId: string, scheduledAt?: string): StudySession;
  endSession(id: string, recap: string): StudySession | undefined;
  getSessionsForPairing(pairingId: string): StudySession[];
}

export class DatabaseStorage implements IStorage {
  // -------- users --------
  getUser(uid: string): User | undefined {
    return db.select().from(users).where(eq(users.id, uid)).get();
  }
  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }
  upsertUserByEmail(email: string): User {
    const existing = this.getUserByEmail(email);
    if (existing) return existing;
    return db
      .insert(users)
      .values({ id: id(), email: email.toLowerCase() })
      .returning()
      .get();
  }
  updateUserProfile(
    uid: string,
    profile: { firstName: string; city: string; timezone: string; ageConfirmed: boolean }
  ): User | undefined {
    return db
      .update(users)
      .set({
        firstName: profile.firstName,
        city: profile.city,
        timezone: profile.timezone,
        ageConfirmed: profile.ageConfirmed,
      })
      .where(eq(users.id, uid))
      .returning()
      .get();
  }

  // -------- requests --------
  createRequest(userId: string, data: InsertRequest): PartnerRequest {
    // close any prior open request for the same user (one open at a time keeps things calm)
    db.update(requests)
      .set({ status: "closed" })
      .where(and(eq(requests.userId, userId), eq(requests.status, "open")))
      .run();
    return db
      .insert(requests)
      .values({
        id: id(),
        userId,
        textTitle: data.textTitle,
        pace: data.pace,
        commitment: data.commitment,
        scheduleWindows: data.scheduleWindows ?? null,
        language: data.language ?? "English",
        status: "open",
      })
      .returning()
      .get();
  }
  getOpenRequests(): PartnerRequest[] {
    return db
      .select()
      .from(requests)
      .where(eq(requests.status, "open"))
      .orderBy(requests.createdAt)
      .all();
  }
  getUserOpenRequest(userId: string): PartnerRequest | undefined {
    return db
      .select()
      .from(requests)
      .where(and(eq(requests.userId, userId), eq(requests.status, "open")))
      .get();
  }
  closeRequest(rid: string): void {
    db.update(requests).set({ status: "matched" }).where(eq(requests.id, rid)).run();
  }
  countOpenRequests(): number {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(requests)
      .where(eq(requests.status, "open"))
      .get();
    return row?.c ?? 0;
  }

  // -------- pairings --------
  createPairing(args: {
    userAId: string;
    userBId: string;
    textTitle: string;
    pace?: string | null;
    textSource?: string | null;
  }): Pairing {
    return db
      .insert(pairings)
      .values({
        id: id(),
        userAId: args.userAId,
        userBId: args.userBId,
        textTitle: args.textTitle,
        textSource: args.textSource ?? null,
        pace: args.pace ?? null,
        status: "active",
        notebookContent: "",
      })
      .returning()
      .get();
  }
  getActivePairingForUser(userId: string): Pairing | undefined {
    return db
      .select()
      .from(pairings)
      .where(
        and(
          eq(pairings.status, "active"),
          or(eq(pairings.userAId, userId), eq(pairings.userBId, userId))
        )
      )
      .orderBy(desc(pairings.startedAt))
      .get();
  }
  getPairingsForUser(userId: string): Pairing[] {
    return db
      .select()
      .from(pairings)
      .where(or(eq(pairings.userAId, userId), eq(pairings.userBId, userId)))
      .orderBy(desc(pairings.startedAt))
      .all();
  }
  getPairing(pid: string): Pairing | undefined {
    return db.select().from(pairings).where(eq(pairings.id, pid)).get();
  }
  updateNotebook(pairingId: string, content: string): Pairing | undefined {
    return db
      .update(pairings)
      .set({ notebookContent: content, notebookUpdatedAt: nowIso() })
      .where(eq(pairings.id, pairingId))
      .returning()
      .get();
  }
  endPairing(pid: string, status: "completed" | "dissolved"): void {
    db.update(pairings)
      .set({ status, endedAt: nowIso() })
      .where(eq(pairings.id, pid))
      .run();
  }
  countActivePairings(): number {
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(pairings)
      .where(eq(pairings.status, "active"))
      .get();
    return row?.c ?? 0;
  }
  countCompletedThisWeek(): number {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const row = db
      .select({ c: sql<number>`count(*)` })
      .from(pairings)
      .where(and(eq(pairings.status, "completed"), sql`ended_at >= ${since}`))
      .get();
    return row?.c ?? 0;
  }

  // -------- sessions --------
  createSession(pairingId: string, scheduledAt?: string): StudySession {
    return db
      .insert(sessions)
      .values({
        id: id(),
        pairingId,
        scheduledAt: scheduledAt ?? nowIso(),
        startedAt: nowIso(),
      })
      .returning()
      .get();
  }
  endSession(sid: string, recap: string): StudySession | undefined {
    return db
      .update(sessions)
      .set({ endedAt: nowIso(), recap })
      .where(eq(sessions.id, sid))
      .returning()
      .get();
  }
  getSessionsForPairing(pairingId: string): StudySession[] {
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.pairingId, pairingId))
      .orderBy(desc(sessions.createdAt))
      .all();
  }
}

export const storage = new DatabaseStorage();

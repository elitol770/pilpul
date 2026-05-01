import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type {
  InsertRequest,
  Pairing,
  Request as PartnerRequest,
  StudySession,
  User,
} from "@shared/schema";

type DbUser = {
  id: string;
  email: string;
  first_name: string | null;
  city: string | null;
  timezone: string | null;
  age_confirmed: boolean;
  created_at: string;
};

type DbRequest = {
  id: string;
  user_id: string;
  text_title: string;
  pace: "slow" | "medium" | "fast";
  commitment: "casual" | "serious";
  schedule_windows: string | null;
  language: string | null;
  status: "open" | "matched" | "closed";
  created_at: string;
};

type DbPairing = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  text_title: string;
  text_source: string | null;
  pace: "slow" | "medium" | "fast" | null;
  started_at: string;
  ended_at: string | null;
  status: "active" | "completed" | "dissolved";
  next_session_at: string | null;
  notebook_content: string;
  notebook_updated_at: string;
};

type DbSession = {
  id: string;
  pairing_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  recap: string | null;
  created_at: string;
};

type SupabaseEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const id = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function requireEnv(env: SupabaseEnv, name: keyof SupabaseEnv): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required for Supabase storage`);
  }
  return value;
}

export function createServerSupabaseClient(env: SupabaseEnv = process.env as SupabaseEnv): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createStorage(env: SupabaseEnv): SupabaseStorage {
  return new SupabaseStorage(createServerSupabaseClient(env));
}

function throwDb(error: PostgrestError | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function requireRow<T>(row: T | null, context: string): T {
  if (!row) {
    throw new Error(`${context}: no row returned`);
  }
  return row;
}

function mapUser(row: DbUser): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    city: row.city,
    timezone: row.timezone,
    ageConfirmed: row.age_confirmed,
    createdAt: row.created_at,
  };
}

function mapRequest(row: DbRequest): PartnerRequest {
  return {
    id: row.id,
    userId: row.user_id,
    textTitle: row.text_title,
    pace: row.pace,
    commitment: row.commitment,
    scheduleWindows: row.schedule_windows,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapPairing(row: DbPairing): Pairing {
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    textTitle: row.text_title,
    textSource: row.text_source,
    pace: row.pace,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    nextSessionAt: row.next_session_at,
    notebookContent: row.notebook_content,
    notebookUpdatedAt: row.notebook_updated_at,
  };
}

function mapSession(row: DbSession): StudySession {
  return {
    id: row.id,
    pairingId: row.pairing_id,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    recap: row.recap,
    createdAt: row.created_at,
  };
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUserByEmail(email: string): Promise<User>;
  updateUserProfile(
    id: string,
    profile: { firstName: string; city: string; timezone: string; ageConfirmed: boolean }
  ): Promise<User | undefined>;
  getUserForVisitor(visitorId: string): Promise<User | undefined>;
  linkVisitorToUser(visitorId: string, userId: string): Promise<void>;
  unlinkVisitor(visitorId: string): Promise<void>;

  createRequest(userId: string, data: InsertRequest): Promise<PartnerRequest>;
  getOpenRequests(): Promise<PartnerRequest[]>;
  getUserOpenRequest(userId: string): Promise<PartnerRequest | undefined>;
  closeRequest(id: string): Promise<void>;
  countOpenRequests(): Promise<number>;

  createPairing(args: {
    userAId: string;
    userBId: string;
    textTitle: string;
    pace?: string | null;
    textSource?: string | null;
  }): Promise<Pairing>;
  getActivePairingForUser(userId: string): Promise<Pairing | undefined>;
  getPairingsForUser(userId: string): Promise<Pairing[]>;
  getPairing(id: string): Promise<Pairing | undefined>;
  updateNotebook(pairingId: string, content: string): Promise<Pairing | undefined>;
  endPairing(id: string, status: "completed" | "dissolved"): Promise<void>;
  countActivePairings(): Promise<number>;
  countCompletedThisWeek(): Promise<number>;

  createSession(pairingId: string, scheduledAt?: string): Promise<StudySession>;
  endSession(id: string, recap: string): Promise<StudySession | undefined>;
  getSessionsForPairing(pairingId: string): Promise<StudySession[]>;
}

export class SupabaseStorage implements IStorage {
  constructor(private readonly db = createServerSupabaseClient()) {}

  async getUser(uid: string): Promise<User | undefined> {
    const { data, error } = await this.db.from("users").select("*").eq("id", uid).maybeSingle<DbUser>();
    throwDb(error, "get user");
    return data ? mapUser(data) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    const { data, error } = await this.db
      .from("users")
      .select("*")
      .eq("email", normalized)
      .maybeSingle<DbUser>();
    throwDb(error, "get user by email");
    return data ? mapUser(data) : undefined;
  }

  async upsertUserByEmail(email: string): Promise<User> {
    const normalized = email.toLowerCase();
    const existing = await this.getUserByEmail(normalized);
    if (existing) return existing;

    const { data, error } = await this.db
      .from("users")
      .insert({ id: id(), email: normalized })
      .select("*")
      .single<DbUser>();
    throwDb(error, "create user");
    return mapUser(requireRow(data, "create user"));
  }

  async updateUserProfile(
    uid: string,
    profile: { firstName: string; city: string; timezone: string; ageConfirmed: boolean }
  ): Promise<User | undefined> {
    const { data, error } = await this.db
      .from("users")
      .update({
        first_name: profile.firstName,
        city: profile.city,
        timezone: profile.timezone,
        age_confirmed: profile.ageConfirmed,
      })
      .eq("id", uid)
      .select("*")
      .maybeSingle<DbUser>();
    throwDb(error, "update user profile");
    return data ? mapUser(data) : undefined;
  }

  async getUserForVisitor(visitorId: string): Promise<User | undefined> {
    const { data, error } = await this.db
      .from("visitor_sessions")
      .select("users(*)")
      .eq("visitor_id", visitorId)
      .maybeSingle<{ users: DbUser | null }>();
    throwDb(error, "get visitor session");
    return data?.users ? mapUser(data.users) : undefined;
  }

  async linkVisitorToUser(visitorId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("visitor_sessions")
      .upsert({ visitor_id: visitorId, user_id: userId, updated_at: nowIso() }, { onConflict: "visitor_id" });
    throwDb(error, "link visitor session");
  }

  async unlinkVisitor(visitorId: string): Promise<void> {
    const { error } = await this.db.from("visitor_sessions").delete().eq("visitor_id", visitorId);
    throwDb(error, "unlink visitor session");
  }

  async createRequest(userId: string, data: InsertRequest): Promise<PartnerRequest> {
    const { error: closeError } = await this.db
      .from("requests")
      .update({ status: "closed" })
      .eq("user_id", userId)
      .eq("status", "open");
    throwDb(closeError, "close prior open requests");

    const { data: row, error } = await this.db
      .from("requests")
      .insert({
        id: id(),
        user_id: userId,
        text_title: data.textTitle,
        pace: data.pace,
        commitment: data.commitment,
        schedule_windows: data.scheduleWindows ?? null,
        language: data.language ?? "English",
        status: "open",
      })
      .select("*")
      .single<DbRequest>();
    throwDb(error, "create request");
    return mapRequest(requireRow(row, "create request"));
  }

  async getOpenRequests(): Promise<PartnerRequest[]> {
    const { data, error } = await this.db
      .from("requests")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: true });
    throwDb(error, "get open requests");
    return (data ?? []).map((row) => mapRequest(row as DbRequest));
  }

  async getUserOpenRequest(userId: string): Promise<PartnerRequest | undefined> {
    const { data, error } = await this.db
      .from("requests")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DbRequest>();
    throwDb(error, "get user open request");
    return data ? mapRequest(data) : undefined;
  }

  async closeRequest(rid: string): Promise<void> {
    const { error } = await this.db.from("requests").update({ status: "matched" }).eq("id", rid);
    throwDb(error, "close request");
  }

  async countOpenRequests(): Promise<number> {
    const { count, error } = await this.db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    throwDb(error, "count open requests");
    return count ?? 0;
  }

  async createPairing(args: {
    userAId: string;
    userBId: string;
    textTitle: string;
    pace?: string | null;
    textSource?: string | null;
  }): Promise<Pairing> {
    const { data, error } = await this.db
      .from("pairings")
      .insert({
        id: id(),
        user_a_id: args.userAId,
        user_b_id: args.userBId,
        text_title: args.textTitle,
        text_source: args.textSource ?? null,
        pace: args.pace ?? null,
        status: "active",
        notebook_content: "",
      })
      .select("*")
      .single<DbPairing>();
    throwDb(error, "create pairing");
    return mapPairing(requireRow(data, "create pairing"));
  }

  async getActivePairingForUser(userId: string): Promise<Pairing | undefined> {
    const { data, error } = await this.db
      .from("pairings")
      .select("*")
      .eq("status", "active")
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<DbPairing>();
    throwDb(error, "get active pairing");
    return data ? mapPairing(data) : undefined;
  }

  async getPairingsForUser(userId: string): Promise<Pairing[]> {
    const { data, error } = await this.db
      .from("pairings")
      .select("*")
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order("started_at", { ascending: false });
    throwDb(error, "get pairings for user");
    return (data ?? []).map((row) => mapPairing(row as DbPairing));
  }

  async getPairing(pid: string): Promise<Pairing | undefined> {
    const { data, error } = await this.db.from("pairings").select("*").eq("id", pid).maybeSingle<DbPairing>();
    throwDb(error, "get pairing");
    return data ? mapPairing(data) : undefined;
  }

  async updateNotebook(pairingId: string, content: string): Promise<Pairing | undefined> {
    const { data, error } = await this.db
      .from("pairings")
      .update({ notebook_content: content, notebook_updated_at: nowIso() })
      .eq("id", pairingId)
      .select("*")
      .maybeSingle<DbPairing>();
    throwDb(error, "update notebook");
    return data ? mapPairing(data) : undefined;
  }

  async endPairing(pid: string, status: "completed" | "dissolved"): Promise<void> {
    const { error } = await this.db.from("pairings").update({ status, ended_at: nowIso() }).eq("id", pid);
    throwDb(error, "end pairing");
  }

  async countActivePairings(): Promise<number> {
    const { count, error } = await this.db
      .from("pairings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    throwDb(error, "count active pairings");
    return count ?? 0;
  }

  async countCompletedThisWeek(): Promise<number> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await this.db
      .from("pairings")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("ended_at", since);
    throwDb(error, "count completed pairings");
    return count ?? 0;
  }

  async createSession(pairingId: string, scheduledAt?: string): Promise<StudySession> {
    const now = nowIso();
    const { data, error } = await this.db
      .from("sessions")
      .insert({
        id: id(),
        pairing_id: pairingId,
        scheduled_at: scheduledAt ?? now,
        started_at: now,
      })
      .select("*")
      .single<DbSession>();
    throwDb(error, "create session");
    return mapSession(requireRow(data, "create session"));
  }

  async endSession(sid: string, recap: string): Promise<StudySession | undefined> {
    const { data, error } = await this.db
      .from("sessions")
      .update({ ended_at: nowIso(), recap })
      .eq("id", sid)
      .select("*")
      .maybeSingle<DbSession>();
    throwDb(error, "end session");
    return data ? mapSession(data) : undefined;
  }

  async getSessionsForPairing(pairingId: string): Promise<StudySession[]> {
    const { data, error } = await this.db
      .from("sessions")
      .select("*")
      .eq("pairing_id", pairingId)
      .order("created_at", { ascending: false });
    throwDb(error, "get sessions for pairing");
    return (data ?? []).map((row) => mapSession(row as DbSession));
  }
}

let storageSingleton: IStorage | undefined;

export function getStorage(): IStorage {
  storageSingleton ??= new SupabaseStorage();
  return storageSingleton;
}

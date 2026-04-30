import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { runMatching } from "./matching";
import {
  insertRequestSchema,
  profileSchema,
  claimEmailSchema,
} from "@shared/schema";
import { z } from "zod";

// ---------- Identity ----------
//
// The prototype identifies a person by an X-Visitor-Id header injected by the
// site proxy (one stable id per browser). On first claim of an email, we attach
// the visitor id to a user record. After that, the visitor id maps directly to
// a user. No passwords, no real magic-link emails — appropriate for a demo.

const visitorToUserId = new Map<string, string>();

function getVisitorId(req: Request): string {
  const v = (req.headers["x-visitor-id"] as string) || "";
  return v || "anon";
}

function getCurrentUser(req: Request) {
  const visitor = getVisitorId(req);
  const uid = visitorToUserId.get(visitor);
  if (!uid) return null;
  return storage.getUser(uid) ?? null;
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ message: "Not signed in" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---- session ----
  app.get("/api/me", (req, res) => {
    const user = getCurrentUser(req);
    res.json({ user });
  });

  app.post("/api/claim-email", (req, res) => {
    const parse = claimEmailSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const user = storage.upsertUserByEmail(parse.data.email);
    visitorToUserId.set(getVisitorId(req), user.id);
    res.json({ user });
  });

  app.post("/api/sign-out", (req, res) => {
    visitorToUserId.delete(getVisitorId(req));
    res.json({ ok: true });
  });

  app.patch("/api/me", requireUser, (req, res) => {
    const user = (req as any).user;
    const parse = profileSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const updated = storage.updateUserProfile(user.id, parse.data);
    res.json({ user: updated });
  });

  // ---- requests ----
  app.get("/api/requests/mine", requireUser, (req, res) => {
    const user = (req as any).user;
    const open = storage.getUserOpenRequest(user.id) ?? null;
    res.json({ request: open });
  });

  app.post("/api/requests", requireUser, (req, res) => {
    const user = (req as any).user;
    const parse = insertRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const r = storage.createRequest(user.id, parse.data);
    // Try matching immediately so demo users see fast feedback.
    runMatching();
    res.json({ request: r });
  });

  // ---- pairings ----
  app.get("/api/pairings/active", requireUser, (req, res) => {
    const user = (req as any).user;
    const pairing = storage.getActivePairingForUser(user.id) ?? null;
    let partner = null;
    if (pairing) {
      const partnerId = pairing.userAId === user.id ? pairing.userBId : pairing.userAId;
      partner = storage.getUser(partnerId);
    }
    res.json({ pairing, partner });
  });

  app.get("/api/pairings", requireUser, (req, res) => {
    const user = (req as any).user;
    const ps = storage.getPairingsForUser(user.id);
    const enriched = ps.map((p) => {
      const partnerId = p.userAId === user.id ? p.userBId : p.userAId;
      const partner = storage.getUser(partnerId);
      const sessionCount = storage.getSessionsForPairing(p.id).length;
      return { pairing: p, partner, sessionCount };
    });
    res.json({ pairings: enriched });
  });

  app.get("/api/pairings/:id", requireUser, (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const partnerId = pairing.userAId === user.id ? pairing.userBId : pairing.userAId;
    const partner = storage.getUser(partnerId);
    const sessions = storage.getSessionsForPairing(pairing.id);
    res.json({ pairing, partner, sessions });
  });

  // Notebook polling endpoint — light-weight pseudo-realtime.
  // Returns content + an ETag-like updatedAt so the client can short-poll.
  app.get("/api/pairings/:id/notebook", requireUser, (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json({
      content: pairing.notebookContent ?? "",
      updatedAt: pairing.notebookUpdatedAt ?? null,
    });
  });

  app.put("/api/pairings/:id/notebook", requireUser, (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const parse = z.object({ content: z.string() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: "Invalid body" });
    const updated = storage.updateNotebook(pairing.id, parse.data.content);
    res.json({
      content: updated?.notebookContent ?? "",
      updatedAt: updated?.notebookUpdatedAt ?? null,
    });
  });

  app.post("/api/pairings/:id/end", requireUser, (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const status = req.body?.status === "completed" ? "completed" : "dissolved";
    storage.endPairing(pairing.id, status);
    res.json({ ok: true });
  });

  // ---- ambient hum (anonymous activity counts) ----
  app.get("/api/hum", (_req, res) => {
    res.json({
      activePairs: storage.countActivePairings(),
      finishedThisWeek: storage.countCompletedThisWeek(),
      openInQueue: storage.countOpenRequests(),
    });
  });

  // ---- demo helpers (so a single user can experience the full flow) ----
  app.post("/api/demo/seed-partner", requireUser, (req, res) => {
    const user = (req as any).user;
    const partnerEmail = `demo-${Date.now()}@chavruta.local`;
    const partner = storage.upsertUserByEmail(partnerEmail);
    storage.updateUserProfile(partner.id, {
      firstName: req.body?.firstName || "David",
      city: req.body?.city || "Lisbon",
      timezone: "Europe/Lisbon",
      ageConfirmed: true,
    });
    const text = req.body?.text || "Meditations — Marcus Aurelius";
    storage.createRequest(partner.id, {
      textTitle: text,
      pace: req.body?.pace || "medium",
      commitment: req.body?.commitment || "serious",
      scheduleWindows: "Weekday evenings",
      language: "English",
    });
    storage.createRequest(user.id, {
      textTitle: text,
      pace: req.body?.pace || "medium",
      commitment: req.body?.commitment || "serious",
      scheduleWindows: "Weekday evenings",
      language: "English",
    });
    runMatching();
    res.json({ ok: true });
  });

  return httpServer;
}

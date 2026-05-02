import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { createServerSupabaseClient, getStorage } from "./storage";
import { runMatching } from "./matching";
import {
  fetchPdfSchema,
  insertRequestSchema,
  profileSchema,
  claimEmailSchema,
} from "@shared/schema";
import { z } from "zod";

const storage = getStorage();
const PDF_BUCKET = "reading-texts";
const MAX_PDF_BYTES = 50 * 1024 * 1024;

// ---------- Identity ----------
//
// The prototype identifies a person by an X-Visitor-Id header from the client.
// That visitor id is persisted in Supabase so a deploy/restart does not wipe
// the lightweight demo session mapping.

function getVisitorId(req: Request): string {
  const v = (req.headers["x-visitor-id"] as string) || "";
  return v || "anon";
}

async function getCurrentUser(req: Request) {
  return await storage.getUserForVisitor(getVisitorId(req));
}

async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ message: "Not signed in" });
      return;
    }
    (req as any).user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function cleanTitle(value: unknown, fallback: string): string {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || fallback).replace(/\.pdf$/i, "").slice(0, 180);
}

function titleFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop();
  if (!last) return url.hostname;
  try {
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return last.replace(/[-_]+/g, " ");
  }
}

function isPdfBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const sig = new Uint8Array(buffer.slice(0, 5));
  return sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46 && sig[4] === 0x2d;
}

async function saveFetchedPdf(userId: string, title: string, sourceUrl: string, buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF must be 50 MB or smaller");
  }
  if (!isPdfBytes(buffer)) {
    throw new Error("That file does not look like a PDF");
  }

  const storagePath = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error } = await createServerSupabaseClient().storage.from(PDF_BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`upload PDF: ${error.message}`);

  return await storage.createReadingText(userId, {
    title,
    sourceKind: "web_pdf",
    sourceUrl,
    storagePath,
    fileSize: buffer.byteLength,
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---- session ----
  app.get("/api/me", async (req, res) => {
    const user = await getCurrentUser(req);
    res.json({ user: user ?? null });
  });

  app.post("/api/claim-email", async (req, res) => {
    const parse = claimEmailSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const user = await storage.upsertUserByEmail(parse.data.email);
    await storage.linkVisitorToUser(getVisitorId(req), user.id);
    res.json({ user });
  });

  app.post("/api/sign-out", async (req, res) => {
    await storage.unlinkVisitor(getVisitorId(req));
    res.json({ ok: true });
  });

  app.patch("/api/me", requireUser, async (req, res) => {
    const user = (req as any).user;
    const parse = profileSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const updated = await storage.updateUserProfile(user.id, parse.data);
    res.json({ user: updated });
  });

  // ---- uploaded/imported texts ----
  app.get("/api/texts", requireUser, async (req, res) => {
    const user = (req as any).user;
    const texts = await storage.listReadingTextsForUser(user.id);
    res.json({ texts });
  });

  app.post("/api/texts/upload", requireUser, async (_req, res) => {
    res.status(501).json({
      message: "Local Express dev does not handle multipart uploads. Use Cloudflare Pages dev for PDF upload testing.",
    });
  });

  app.post("/api/texts/fetch", requireUser, async (req, res) => {
    const user = (req as any).user;
    const parse = fetchPdfSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }

    const sourceUrl = new URL(parse.data.url);
    if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
      return res.status(400).json({ message: "Enter an http or https PDF URL" });
    }

    const fetched = await fetch(sourceUrl.toString(), { headers: { Accept: "application/pdf" } });
    if (!fetched.ok) return res.status(400).json({ message: `Could not fetch PDF (${fetched.status})` });

    const contentType = fetched.headers.get("content-type") ?? "";
    const contentLength = Number(fetched.headers.get("content-length") ?? 0);
    const urlLooksPdf = sourceUrl.pathname.toLowerCase().endsWith(".pdf");
    if (!contentType.toLowerCase().includes("pdf") && !urlLooksPdf) {
      return res.status(400).json({ message: "That URL does not appear to be a direct PDF" });
    }
    if (contentLength > MAX_PDF_BYTES) {
      return res.status(400).json({ message: "PDF must be 50 MB or smaller" });
    }

    const text = await saveFetchedPdf(
      user.id,
      cleanTitle(parse.data.title, titleFromUrl(sourceUrl)),
      sourceUrl.toString(),
      await fetched.arrayBuffer()
    );
    res.json({ text });
  });

  app.get("/api/texts/:id/url", requireUser, async (req, res) => {
    const user = (req as any).user;
    const text = await storage.getReadingText(String(req.params.id));
    if (!text || text.ownerUserId !== user.id) return res.status(404).json({ message: "Not found" });
    const signedUrl = await storage.createReadingTextSignedUrl(text.id);
    res.json({ signedUrl });
  });

  // ---- requests ----
  app.get("/api/requests/mine", requireUser, async (req, res) => {
    const user = (req as any).user;
    const open = (await storage.getUserOpenRequest(user.id)) ?? null;
    res.json({ request: open });
  });

  app.post("/api/requests", requireUser, async (req, res) => {
    const user = (req as any).user;
    const parse = insertRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    if (parse.data.textSourceId) {
      const text = await storage.getReadingText(parse.data.textSourceId);
      if (!text || text.ownerUserId !== user.id) return res.status(400).json({ message: "Text source not found" });
    }
    const r = await storage.createRequest(user.id, parse.data);
    // Try matching immediately so demo users see fast feedback.
    await runMatching();
    res.json({ request: r });
  });

  // ---- pairings ----
  app.get("/api/pairings/active", requireUser, async (req, res) => {
    const user = (req as any).user;
    const pairing = (await storage.getActivePairingForUser(user.id)) ?? null;
    let partner = null;
    if (pairing) {
      const partnerId = pairing.userAId === user.id ? pairing.userBId : pairing.userAId;
      partner = await storage.getUser(partnerId);
    }
    res.json({ pairing, partner });
  });

  app.get("/api/pairings", requireUser, async (req, res) => {
    const user = (req as any).user;
    const ps = await storage.getPairingsForUser(user.id);
    const enriched = await Promise.all(
      ps.map(async (p) => {
        const partnerId = p.userAId === user.id ? p.userBId : p.userAId;
        const partner = await storage.getUser(partnerId);
        const sessionCount = (await storage.getSessionsForPairing(p.id)).length;
        return { pairing: p, partner, sessionCount };
      })
    );
    res.json({ pairings: enriched });
  });

  app.get("/api/pairings/:id", requireUser, async (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = await storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const partnerId = pairing.userAId === user.id ? pairing.userBId : pairing.userAId;
    const partner = await storage.getUser(partnerId);
    const sessions = await storage.getSessionsForPairing(pairing.id);
    let readingText = null;
    if (pairing.textSourceId) {
      const text = await storage.getReadingText(pairing.textSourceId);
      if (text) {
        readingText = {
          ...text,
          signedUrl: await storage.createReadingTextSignedUrl(text.id),
        };
      }
    }
    res.json({ pairing, partner, sessions, readingText });
  });

  // Notebook polling endpoint — light-weight pseudo-realtime.
  // Returns content + an ETag-like updatedAt so the client can short-poll.
  app.get("/api/pairings/:id/notebook", requireUser, async (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = await storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json({
      content: pairing.notebookContent ?? "",
      updatedAt: pairing.notebookUpdatedAt ?? null,
    });
  });

  app.put("/api/pairings/:id/notebook", requireUser, async (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = await storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const parse = z.object({ content: z.string() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: "Invalid body" });
    const updated = await storage.updateNotebook(pairing.id, parse.data.content);
    res.json({
      content: updated?.notebookContent ?? "",
      updatedAt: updated?.notebookUpdatedAt ?? null,
    });
  });

  app.post("/api/pairings/:id/end", requireUser, async (req, res) => {
    const user = (req as any).user;
    const pid = String(req.params.id);
    const pairing = await storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const status = req.body?.status === "completed" ? "completed" : "dissolved";
    await storage.endPairing(pairing.id, status);
    res.json({ ok: true });
  });

  // ---- ambient hum (anonymous activity counts) ----
  app.get("/api/hum", async (_req, res) => {
    const [activePairs, finishedThisWeek, openInQueue] = await Promise.all([
      storage.countActivePairings(),
      storage.countCompletedThisWeek(),
      storage.countOpenRequests(),
    ]);
    res.json({ activePairs, finishedThisWeek, openInQueue });
  });

  // ---- demo helpers (so a single user can experience the full flow) ----
  app.post("/api/demo/seed-partner", requireUser, async (req, res) => {
    const user = (req as any).user;
    const partnerEmail = `demo-${Date.now()}@pilpul.local`;
    const partner = await storage.upsertUserByEmail(partnerEmail);
    await storage.updateUserProfile(partner.id, {
      firstName: req.body?.firstName || "David",
      city: req.body?.city || "Lisbon",
      timezone: "Europe/Lisbon",
      ageConfirmed: true,
    });
    const text = req.body?.text || "Meditations — Marcus Aurelius";
    await storage.createRequest(partner.id, {
      textTitle: text,
      pace: req.body?.pace || "medium",
      commitment: req.body?.commitment || "serious",
      scheduleWindows: "Weekday evenings",
      language: "English",
    });
    await storage.createRequest(user.id, {
      textTitle: text,
      pace: req.body?.pace || "medium",
      commitment: req.body?.commitment || "serious",
      scheduleWindows: "Weekday evenings",
      language: "English",
    });
    await runMatching();
    res.json({ ok: true });
  });

  return httpServer;
}

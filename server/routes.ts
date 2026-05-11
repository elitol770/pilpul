import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { createServerSupabaseClient, getStorage } from "./storage";
import { runMatching } from "./matching";
import { parseAvailability } from "@shared/availability";
import {
  cleanTitle,
  fetchPdfFromWeb,
  isPdfBytes,
  MAX_PDF_BYTES,
  PdfFetchError,
  PDF_BUCKET,
} from "./pdf";
import {
  createReportSchema,
  createInviteSchema,
  fetchPdfSchema,
  insertRequestSchema,
  manualPairSchema,
  profileSchema,
  claimEmailSchema,
  requestMagicLinkSchema,
  verifyMagicLinkSchema,
  type User,
} from "@shared/schema";
import { z } from "zod";
import { createMagicToken, hashMagicToken, magicLinkExpiresAt } from "./auth";
import {
  appOrigin,
  buildMagicLink,
  canReturnDevMagicLink,
  normalizeRedirectPath,
  sendMagicLinkEmail,
} from "./email";
import {
  clearSessionCookie,
  createSessionId,
  sessionCookie,
  sessionIdFromRequestLike,
} from "./session";
import { clientIpFromRequestLike, rateLimitKey, type RateLimitPolicy } from "./rate-limit";

const storage = getStorage();

const LIMITS = {
  magicLinkIp: { limit: 5, windowSeconds: 10 * 60 },
  magicLinkEmail: { limit: 3, windowSeconds: 15 * 60 },
  verifyIp: { limit: 20, windowSeconds: 10 * 60 },
  profileUser: { limit: 20, windowSeconds: 60 * 60 },
  textImportUser: { limit: 10, windowSeconds: 60 * 60 },
  requestUser: { limit: 10, windowSeconds: 60 * 60 },
  acceptUser: { limit: 30, windowSeconds: 60 * 60 },
  inviteUser: { limit: 20, windowSeconds: 60 * 60 },
  reportUser: { limit: 5, windowSeconds: 24 * 60 * 60 },
  demoUser: { limit: 5, windowSeconds: 24 * 60 * 60 },
} satisfies Record<string, RateLimitPolicy>;

// ---------- Identity ----------
//
// New sessions use a server-issued HttpOnly cookie. The older X-Visitor-Id
// header remains as a temporary compatibility fallback for existing browsers.

function getSessionId(req: Request): string | null {
  return sessionIdFromRequestLike(req.headers as Record<string, string | string[] | undefined>);
}

function clientIp(req: Request): string {
  return clientIpFromRequestLike(req.headers as Record<string, string | string[] | undefined>, req.ip);
}

async function enforceRateLimit(
  res: Response,
  action: string,
  identifier: string,
  policy: RateLimitPolicy
): Promise<boolean> {
  const result = await storage.consumeRateLimit({
    key: await rateLimitKey(action, identifier),
    action,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });
  if (result.allowed) return true;

  const retryAfter = Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ message: "Too many attempts. Try again later." });
  return false;
}

async function getCurrentUser(req: Request) {
  const sessionId = getSessionId(req);
  return sessionId ? await storage.getUserForVisitor(sessionId) : undefined;
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

function requireMatchingReady(user: User, res: Response): boolean {
  if (user.matchingSuspendedAt) {
    res.status(403).json({ message: "Matching is paused for this account." });
    return false;
  }
  if (!user.firstName || !user.city || !user.ageConfirmed) {
    res.status(403).json({ message: "Complete your profile before entering the queue." });
    return false;
  }
  return true;
}

function inviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function requireMaintainer(user: User, res: Response): boolean {
  const emails = (process.env.MAINTAINER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) {
    res.status(403).json({ message: "Set MAINTAINER_EMAILS to enable the maintainer dashboard." });
    return false;
  }
  if (!emails.includes(user.email.toLowerCase())) {
    res.status(403).json({ message: "Not a maintainer account." });
    return false;
  }
  return true;
}

function emailEnv() {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    APP_ORIGIN: process.env.APP_ORIGIN,
    ALLOW_DEV_MAGIC_LINKS: process.env.ALLOW_DEV_MAGIC_LINKS,
  };
}

async function validateOwnedTextSource(userId: string, textSourceId?: string | null): Promise<string | null> {
  if (!textSourceId) return null;
  const text = await storage.getReadingText(textSourceId);
  if (!text || text.ownerUserId !== userId) return "Text source not found";
  return null;
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

  app.post("/api/auth/magic-link", async (req, res) => {
    const parse = requestMagicLinkSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }

    const email = parse.data.email.toLowerCase();
    if (!(await enforceRateLimit(res, "magic-link:ip", clientIp(req), LIMITS.magicLinkIp))) return;
    if (!(await enforceRateLimit(res, "magic-link:email", email, LIMITS.magicLinkEmail))) return;

    const token = createMagicToken();
    await storage.createEmailMagicLink({
      tokenHash: await hashMagicToken(token),
      email,
      redirectPath: normalizeRedirectPath(parse.data.redirectPath),
      expiresAt: magicLinkExpiresAt(),
    });

    const origin = appOrigin(
      `${req.protocol}://${req.get("host") ?? "localhost:5000"}${req.originalUrl}`,
      process.env.APP_ORIGIN
    );
    const magicLink = buildMagicLink(origin, token);
    const delivery = await sendMagicLinkEmail({ env: emailEnv(), to: email, magicLink });
    if (!delivery.sent) {
      if (!canReturnDevMagicLink(origin, emailEnv())) {
        return res.status(503).json({ message: "Email is not configured yet." });
      }
      return res.json({ ok: true, sent: false, devLink: magicLink });
    }

    res.json({ ok: true, sent: true });
  });

  app.post("/api/auth/verify", async (req, res) => {
    if (!(await enforceRateLimit(res, "auth-verify:ip", clientIp(req), LIMITS.verifyIp))) return;

    const parse = verifyMagicLinkSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }

    const consumed = await storage.consumeEmailMagicLink(await hashMagicToken(parse.data.token), new Date().toISOString());
    if (!consumed) {
      return res.status(400).json({ message: "This sign-in link is invalid or expired." });
    }

    const user = await storage.upsertUserByEmail(consumed.email);
    const sessionId = createSessionId();
    await storage.linkVisitorToUser(sessionId, user.id);
    res.setHeader(
      "Set-Cookie",
      sessionCookie(sessionId, `${req.protocol}://${req.get("host") ?? "localhost:5000"}${req.originalUrl}`)
    );
    res.json({ user, redirectPath: normalizeRedirectPath(consumed.redirectPath) });
  });

  app.post("/api/claim-email", async (req, res) => {
    if (process.env.ALLOW_UNVERIFIED_EMAIL_CLAIM !== "true" && process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Email verification is required." });
    }
    const parse = claimEmailSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    const email = parse.data.email.toLowerCase();
    if (!(await enforceRateLimit(res, "claim-email:ip", clientIp(req), LIMITS.magicLinkIp))) return;
    if (!(await enforceRateLimit(res, "claim-email:email", email, LIMITS.magicLinkEmail))) return;
    const user = await storage.upsertUserByEmail(email);
    const sessionId = createSessionId();
    await storage.linkVisitorToUser(sessionId, user.id);
    res.setHeader(
      "Set-Cookie",
      sessionCookie(sessionId, `${req.protocol}://${req.get("host") ?? "localhost:5000"}${req.originalUrl}`)
    );
    res.json({ user });
  });

  app.post("/api/sign-out", async (req, res) => {
    const sessionId = getSessionId(req);
    if (sessionId) await storage.unlinkVisitor(sessionId);
    res.setHeader(
      "Set-Cookie",
      clearSessionCookie(`${req.protocol}://${req.get("host") ?? "localhost:5000"}${req.originalUrl}`)
    );
    res.json({ ok: true });
  });

  app.patch("/api/me", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!(await enforceRateLimit(res, "profile:update", user.id, LIMITS.profileUser))) return;

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
    if (!(await enforceRateLimit(res, "texts:fetch", user.id, LIMITS.textImportUser))) return;

    const parse = fetchPdfSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }

    let fetchedPdf;
    try {
      fetchedPdf = await fetchPdfFromWeb(parse.data.url);
    } catch (error) {
      if (error instanceof PdfFetchError) return res.status(error.status).json({ message: error.message });
      throw error;
    }

    const text = await saveFetchedPdf(
      user.id,
      cleanTitle(parse.data.title, fetchedPdf.titleFallback),
      fetchedPdf.sourceUrl,
      fetchedPdf.buffer
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
  app.get("/api/requests/open", requireUser, async (req, res) => {
    const user = (req as any).user;
    const suspended = await storage.getSuspendedUserIds();
    const requests = (await storage.getOpenRequestsWithUsers(user.id)).filter((item) => !suspended.has(item.userId));
    res.json({ requests });
  });

  app.get("/api/requests/mine", requireUser, async (req, res) => {
    const user = (req as any).user;
    const open = (await storage.getUserOpenRequest(user.id)) ?? null;
    res.json({ request: open });
  });

  app.post("/api/requests/mine/close", requireUser, async (req, res) => {
    const user = (req as any).user;
    await storage.closeUserOpenRequest(user.id);
    res.json({ ok: true });
  });

  app.post("/api/requests", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMatchingReady(user, res)) return;
    if (!(await enforceRateLimit(res, "requests:create", user.id, LIMITS.requestUser))) return;

    const parse = insertRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ message: parse.error.issues[0].message });
    }
    if (!parseAvailability(parse.data.scheduleWindows)) {
      return res.status(400).json({ message: "Choose at least one weekly meeting time" });
    }
    const textSourceError = await validateOwnedTextSource(user.id, parse.data.textSourceId);
    if (textSourceError) return res.status(400).json({ message: textSourceError });
    const r = await storage.createRequest(user.id, parse.data);
    // Try matching immediately so demo users see fast feedback.
    await runMatching();
    res.json({ request: r });
  });

  app.post("/api/requests/:id/accept", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMatchingReady(user, res)) return;
    if (!(await enforceRateLimit(res, "requests:accept", user.id, LIMITS.acceptUser))) return;

    const partnerRequest = await storage.getOpenRequestWithUser(String(req.params.id));
    if (!partnerRequest) return res.status(404).json({ message: "That request is no longer open." });
    if (partnerRequest.userId === user.id) return res.status(400).json({ message: "You cannot accept your own request." });

    const partner = await storage.getUser(partnerRequest.userId);
    if (!partner || partner.matchingSuspendedAt) {
      return res.status(400).json({ message: "That request is no longer available." });
    }

    const pairing = await storage.createPairing({
      userAId: partnerRequest.userId,
      userBId: user.id,
      textTitle: partnerRequest.textTitle,
      textSourceId: partnerRequest.textSourceId,
      pace: partnerRequest.pace,
    });
    await Promise.all([
      storage.closeRequest(partnerRequest.id),
      storage.closeUserOpenRequest(user.id),
      storage.createSession(pairing.id),
    ]);
    res.json({ pairing });
  });

  // ---- direct invites ----
  app.post("/api/invites", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMatchingReady(user, res)) return;
    if (!(await enforceRateLimit(res, "invites:create", user.id, LIMITS.inviteUser))) return;

    const parse = createInviteSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: parse.error.issues[0].message });
    const textSourceError = await validateOwnedTextSource(user.id, parse.data.textSourceId);
    if (textSourceError) return res.status(400).json({ message: textSourceError });
    if (parse.data.scheduleWindows && !parseAvailability(parse.data.scheduleWindows)) {
      return res.status(400).json({ message: "Choose a valid meeting time or leave it blank" });
    }

    const invite = await storage.createDirectInvite(user.id, inviteToken(), parse.data);
    res.json({ invite });
  });

  app.get("/api/invites/:token", async (req, res) => {
    const invite = await storage.getDirectInviteByToken(String(req.params.token));
    if (!invite) return res.status(404).json({ message: "Invite not found" });
    res.json({ invite });
  });

  app.post("/api/invites/:token/accept", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMatchingReady(user, res)) return;
    if (!(await enforceRateLimit(res, "invites:accept", user.id, LIMITS.acceptUser))) return;

    const invite = await storage.getDirectInviteByToken(String(req.params.token));
    if (!invite) return res.status(404).json({ message: "Invite not found" });
    if (invite.status !== "open") return res.status(409).json({ message: "This invite has already been used." });
    if (invite.inviterId === user.id) return res.status(400).json({ message: "Send this invite to someone else." });

    const inviter = await storage.getUser(invite.inviterId);
    if (!inviter || inviter.matchingSuspendedAt) {
      return res.status(400).json({ message: "This invite is no longer available." });
    }

    const pairing = await storage.createPairing({
      userAId: invite.inviterId,
      userBId: user.id,
      textTitle: invite.textTitle,
      textSourceId: invite.textSourceId,
      pace: invite.pace,
    });
    const accepted = await storage.acceptDirectInvite(invite.id, pairing.id);
    if (!accepted) return res.status(409).json({ message: "This invite has already been used." });
    await Promise.all([
      storage.closeUserOpenRequest(invite.inviterId),
      storage.closeUserOpenRequest(user.id),
      storage.createSession(pairing.id),
    ]);
    res.json({ pairing, invite: accepted });
  });

  // ---- maintainer ----
  app.get("/api/admin/requests", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMaintainer(user, res)) return;
    const suspended = await storage.getSuspendedUserIds();
    const requests = (await storage.getOpenRequestsWithUsers()).filter((item) => !suspended.has(item.userId));
    res.json({ requests });
  });

  app.post("/api/admin/pairings", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!requireMaintainer(user, res)) return;
    const parse = manualPairSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: parse.error.issues[0].message });
    if (parse.data.requestAId === parse.data.requestBId) {
      return res.status(400).json({ message: "Choose two different requests." });
    }

    const [a, b, suspended] = await Promise.all([
      storage.getOpenRequestWithUser(parse.data.requestAId),
      storage.getOpenRequestWithUser(parse.data.requestBId),
      storage.getSuspendedUserIds(),
    ]);
    if (!a || !b) return res.status(404).json({ message: "One of those requests is no longer open." });
    if (a.userId === b.userId) return res.status(400).json({ message: "Choose requests from two different people." });
    if (suspended.has(a.userId) || suspended.has(b.userId)) {
      return res.status(400).json({ message: "One of those accounts is paused from matching." });
    }

    const pairing = await storage.createPairing({
      userAId: a.userId,
      userBId: b.userId,
      textTitle: parse.data.textTitle?.trim() || (a.textTitle === b.textTitle ? a.textTitle : `${a.textTitle} / ${b.textTitle}`),
      textSourceId: a.textSourceId ?? b.textSourceId,
      pace: a.pace,
    });
    await Promise.all([storage.closeRequest(a.id), storage.closeRequest(b.id), storage.createSession(pairing.id)]);
    res.json({ pairing });
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
    const parse = z
      .object({
        content: z.string().max(200_000, "Notebook is too large"),
        baseUpdatedAt: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: "Invalid body" });
    const updated = await storage.updateNotebook(pairing.id, parse.data.content, parse.data.baseUpdatedAt);
    if (!updated && parse.data.baseUpdatedAt) {
      const current = await storage.getPairing(pairing.id);
      return res.status(409).json({
        message: "Notebook changed on another device.",
        content: current?.notebookContent ?? "",
        updatedAt: current?.notebookUpdatedAt ?? null,
      });
    }
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

  app.post("/api/pairings/:id/report", requireUser, async (req, res) => {
    const user = (req as any).user;
    if (!(await enforceRateLimit(res, "reports:create", user.id, LIMITS.reportUser))) return;

    const pid = String(req.params.id);
    const pairing = await storage.getPairing(pid);
    if (!pairing || (pairing.userAId !== user.id && pairing.userBId !== user.id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const parse = createReportSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: parse.error.issues[0].message });
    const report = await storage.createReport(user.id, pairing.id, parse.data);
    await storage.endPairing(pairing.id, "dissolved");
    res.json({ report });
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
    if (!requireMatchingReady(user, res)) return;
    if (!(await enforceRateLimit(res, "demo:seed-partner", user.id, LIMITS.demoUser))) return;

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
      scheduleWindows: JSON.stringify({
        timezone: "UTC",
        windows: [{ day: 1, start: "19:00", end: "21:00" }],
      }),
      language: "English",
    });
    await storage.createRequest(user.id, {
      textTitle: text,
      pace: req.body?.pace || "medium",
      commitment: req.body?.commitment || "serious",
      scheduleWindows: JSON.stringify({
        timezone: "UTC",
        windows: [{ day: 1, start: "19:00", end: "21:00" }],
      }),
      language: "English",
    });
    await runMatching();
    res.json({ ok: true });
  });

  return httpServer;
}

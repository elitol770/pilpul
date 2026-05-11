import { z } from "zod";
import { createServerSupabaseClient, createStorage, type IStorage } from "../../server/storage";
import { runMatching } from "../../server/matching";
import { parseAvailability } from "../../shared/availability";
import {
  cleanTitle,
  fetchPdfFromWeb,
  isPdfBytes,
  MAX_PDF_BYTES,
  PdfFetchError,
  PDF_BUCKET,
} from "../../server/pdf";
import {
  claimEmailSchema,
  createInviteSchema,
  createReportSchema,
  fetchPdfSchema,
  insertRequestSchema,
  manualPairSchema,
  profileSchema,
  requestMagicLinkSchema,
  verifyMagicLinkSchema,
  type ReadingText,
  type User,
} from "../../shared/schema";
import { createMagicToken, hashMagicToken, magicLinkExpiresAt } from "../../server/auth";
import {
  appOrigin,
  buildMagicLink,
  canReturnDevMagicLink,
  normalizeRedirectPath,
  sendMagicLinkEmail,
} from "../../server/email";
import {
  clearSessionCookie,
  createSessionId,
  sessionCookie,
  sessionIdFromHeaders,
} from "../../server/session";
import { clientIpFromHeaders, rateLimitKey, type RateLimitPolicy } from "../../server/rate-limit";

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MAINTAINER_EMAILS?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  APP_ORIGIN?: string;
  ALLOW_DEV_MAGIC_LINKS?: string;
  ALLOW_UNVERIFIED_EMAIL_CLAIM?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

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

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) return {};
  return await request.json();
}

function getSessionId(request: Request): string | null {
  return sessionIdFromHeaders(request.headers);
}

async function rateLimitResponse(
  store: IStorage,
  action: string,
  identifier: string,
  policy: RateLimitPolicy
): Promise<Response | null> {
  const result = await store.consumeRateLimit({
    key: await rateLimitKey(action, identifier),
    action,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });
  if (result.allowed) return null;

  const retryAfter = Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000));
  return json(
    { message: "Too many attempts. Try again later." },
    429,
    { "Retry-After": String(retryAfter) }
  );
}

async function getCurrentUser(store: IStorage, request: Request) {
  const sessionId = getSessionId(request);
  return sessionId ? await store.getUserForVisitor(sessionId) : undefined;
}

async function requireUser(store: IStorage, request: Request) {
  const user = await getCurrentUser(store, request);
  if (!user) {
    return { user: null, response: json({ message: "Not signed in" }, 401) };
  }
  return { user, response: null };
}

function requireMatchingReady(user: User): Response | null {
  if (user.matchingSuspendedAt) {
    return json({ message: "Matching is paused for this account." }, 403);
  }
  if (!user.firstName || !user.city || !user.ageConfirmed) {
    return json({ message: "Complete your profile before entering the queue." }, 403);
  }
  return null;
}

function inviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function requireMaintainer(user: User, env: Env): Response | null {
  const emails = (env.MAINTAINER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) {
    return json({ message: "Set MAINTAINER_EMAILS to enable the maintainer dashboard." }, 403);
  }
  if (!emails.includes(user.email.toLowerCase())) {
    return json({ message: "Not a maintainer account." }, 403);
  }
  return null;
}

async function validateOwnedTextSource(store: IStorage, userId: string, textSourceId?: string | null) {
  if (!textSourceId) return null;
  const text = await store.getReadingText(textSourceId);
  if (!text || text.ownerUserId !== userId) return json({ message: "Text source not found" }, 400);
  return null;
}

type SavePdfResult =
  | { ok: false; response: Response }
  | { ok: true; text: ReadingText };

async function savePdf({
  env,
  store,
  userId,
  title,
  sourceKind,
  sourceUrl,
  buffer,
}: {
  env: Env;
  store: IStorage;
  userId: string;
  title: string;
  sourceKind: "upload" | "web_pdf";
  sourceUrl?: string | null;
  buffer: ArrayBuffer;
}): Promise<SavePdfResult> {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return { ok: false, response: json({ message: "PDF must be 50 MB or smaller" }, 400) };
  }
  if (!isPdfBytes(buffer)) {
    return { ok: false, response: json({ message: "That file does not look like a PDF" }, 400) };
  }

  const storagePath = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error } = await createServerSupabaseClient(env).storage.from(PDF_BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(`upload PDF: ${error.message}`);

  const text = await store.createReadingText(userId, {
    title,
    sourceKind,
    sourceUrl: sourceUrl ?? null,
    storagePath,
    fileSize: buffer.byteLength,
  });
  return { ok: true, text };
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const store = createStorage(env);
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const path = `/${segments.join("/")}`;

  try {
    if (request.method === "GET" && path === "/me") {
      const user = await getCurrentUser(store, request);
      return json({ user: user ?? null });
    }

    if (request.method === "POST" && path === "/auth/magic-link") {
      const parse = requestMagicLinkSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const email = parse.data.email.toLowerCase();
      const ipBlock = await rateLimitResponse(
        store,
        "magic-link:ip",
        clientIpFromHeaders(request.headers),
        LIMITS.magicLinkIp
      );
      if (ipBlock) return ipBlock;
      const emailBlock = await rateLimitResponse(store, "magic-link:email", email, LIMITS.magicLinkEmail);
      if (emailBlock) return emailBlock;

      const token = createMagicToken();
      await store.createEmailMagicLink({
        tokenHash: await hashMagicToken(token),
        email,
        redirectPath: normalizeRedirectPath(parse.data.redirectPath),
        expiresAt: magicLinkExpiresAt(),
      });

      const origin = appOrigin(request.url, env.APP_ORIGIN);
      const magicLink = buildMagicLink(origin, token);
      const delivery = await sendMagicLinkEmail({ env, to: email, magicLink });
      if (!delivery.sent) {
        if (!canReturnDevMagicLink(request.url, env)) {
          return json({ message: "Email is not configured yet." }, 503);
        }
        return json({ ok: true, sent: false, devLink: magicLink });
      }

      return json({ ok: true, sent: true });
    }

    if (request.method === "POST" && path === "/auth/verify") {
      const ipBlock = await rateLimitResponse(
        store,
        "auth-verify:ip",
        clientIpFromHeaders(request.headers),
        LIMITS.verifyIp
      );
      if (ipBlock) return ipBlock;

      const parse = verifyMagicLinkSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const consumed = await store.consumeEmailMagicLink(
        await hashMagicToken(parse.data.token),
        new Date().toISOString()
      );
      if (!consumed) return json({ message: "This sign-in link is invalid or expired." }, 400);

      const user = await store.upsertUserByEmail(consumed.email);
      const sessionId = createSessionId();
      await store.linkVisitorToUser(sessionId, user.id);
      return json(
        { user, redirectPath: normalizeRedirectPath(consumed.redirectPath) },
        200,
        { "Set-Cookie": sessionCookie(sessionId, request.url) }
      );
    }

    if (request.method === "POST" && path === "/claim-email") {
      if (env.ALLOW_UNVERIFIED_EMAIL_CLAIM !== "true") {
        return json({ message: "Email verification is required." }, 403);
      }
      const parse = claimEmailSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const email = parse.data.email.toLowerCase();
      const ipBlock = await rateLimitResponse(
        store,
        "claim-email:ip",
        clientIpFromHeaders(request.headers),
        LIMITS.magicLinkIp
      );
      if (ipBlock) return ipBlock;
      const emailBlock = await rateLimitResponse(store, "claim-email:email", email, LIMITS.magicLinkEmail);
      if (emailBlock) return emailBlock;

      const user = await store.upsertUserByEmail(email);
      const sessionId = createSessionId();
      await store.linkVisitorToUser(sessionId, user.id);
      return json({ user }, 200, { "Set-Cookie": sessionCookie(sessionId, request.url) });
    }

    if (request.method === "POST" && path === "/sign-out") {
      const sessionId = getSessionId(request);
      if (sessionId) await store.unlinkVisitor(sessionId);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request.url) });
    }

    if (request.method === "PATCH" && path === "/me") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const limit = await rateLimitResponse(store, "profile:update", auth.user.id, LIMITS.profileUser);
      if (limit) return limit;

      const parse = profileSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const updated = await store.updateUserProfile(auth.user.id, parse.data);
      return json({ user: updated });
    }

    if (request.method === "GET" && path === "/texts") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const texts = await store.listReadingTextsForUser(auth.user.id);
      return json({ texts });
    }

    if (request.method === "POST" && path === "/texts/upload") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const limit = await rateLimitResponse(store, "texts:upload", auth.user.id, LIMITS.textImportUser);
      if (limit) return limit;

      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ message: "Choose a PDF file" }, 400);
      if (file.size > MAX_PDF_BYTES) return json({ message: "PDF must be 50 MB or smaller" }, 400);
      if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return json({ message: "Choose a PDF file" }, 400);
      }

      const saved = await savePdf({
        env,
        store,
        userId: auth.user.id,
        title: cleanTitle(form.get("title"), file.name || "Uploaded text"),
        sourceKind: "upload",
        buffer: await file.arrayBuffer(),
      });
      if (!saved.ok) return saved.response;
      return json({ text: saved.text });
    }

    if (request.method === "POST" && path === "/texts/fetch") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const limit = await rateLimitResponse(store, "texts:fetch", auth.user.id, LIMITS.textImportUser);
      if (limit) return limit;

      const parse = fetchPdfSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      let fetchedPdf;
      try {
        fetchedPdf = await fetchPdfFromWeb(parse.data.url);
      } catch (error) {
        if (error instanceof PdfFetchError) return json({ message: error.message }, error.status);
        throw error;
      }

      const saved = await savePdf({
        env,
        store,
        userId: auth.user.id,
        title: cleanTitle(parse.data.title, fetchedPdf.titleFallback),
        sourceKind: "web_pdf",
        sourceUrl: fetchedPdf.sourceUrl,
        buffer: fetchedPdf.buffer,
      });
      if (!saved.ok) return saved.response;
      return json({ text: saved.text });
    }

    if (segments[0] === "texts" && segments[1] && segments[2] === "url" && request.method === "GET") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const text = await store.getReadingText(segments[1]);
      if (!text || text.ownerUserId !== auth.user.id) return json({ message: "Not found" }, 404);
      const signedUrl = await store.createReadingTextSignedUrl(text.id);
      return json({ signedUrl });
    }

    if (request.method === "GET" && path === "/requests/open") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const suspended = await store.getSuspendedUserIds();
      const requests = (await store.getOpenRequestsWithUsers(auth.user.id)).filter(
        (item) => !suspended.has(item.userId)
      );
      return json({ requests });
    }

    if (request.method === "GET" && path === "/requests/mine") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const open = (await store.getUserOpenRequest(auth.user.id)) ?? null;
      return json({ request: open });
    }

    if (request.method === "POST" && path === "/requests/mine/close") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      await store.closeUserOpenRequest(auth.user.id);
      return json({ ok: true });
    }

    if (request.method === "POST" && path === "/requests") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const matchingBlock = requireMatchingReady(auth.user);
      if (matchingBlock) return matchingBlock;
      const limit = await rateLimitResponse(store, "requests:create", auth.user.id, LIMITS.requestUser);
      if (limit) return limit;

      const parse = insertRequestSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);
      if (!parseAvailability(parse.data.scheduleWindows)) {
        return json({ message: "Choose at least one weekly meeting time" }, 400);
      }
      const textSourceError = await validateOwnedTextSource(store, auth.user.id, parse.data.textSourceId);
      if (textSourceError) return textSourceError;

      const partnerRequest = await store.createRequest(auth.user.id, parse.data);
      await runMatching(store);
      return json({ request: partnerRequest });
    }

    if (segments[0] === "requests" && segments[1] && segments[2] === "accept" && request.method === "POST") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const matchingBlock = requireMatchingReady(auth.user);
      if (matchingBlock) return matchingBlock;
      const limit = await rateLimitResponse(store, "requests:accept", auth.user.id, LIMITS.acceptUser);
      if (limit) return limit;

      const partnerRequest = await store.getOpenRequestWithUser(segments[1]);
      if (!partnerRequest) return json({ message: "That request is no longer open." }, 404);
      if (partnerRequest.userId === auth.user.id) return json({ message: "You cannot accept your own request." }, 400);

      const partner = await store.getUser(partnerRequest.userId);
      if (!partner || partner.matchingSuspendedAt) return json({ message: "That request is no longer available." }, 400);

      const pairing = await store.createPairing({
        userAId: partnerRequest.userId,
        userBId: auth.user.id,
        textTitle: partnerRequest.textTitle,
        textSourceId: partnerRequest.textSourceId,
        pace: partnerRequest.pace,
      });
      await Promise.all([
        store.closeRequest(partnerRequest.id),
        store.closeUserOpenRequest(auth.user.id),
        store.createSession(pairing.id),
      ]);
      return json({ pairing });
    }

    if (request.method === "POST" && path === "/invites") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const matchingBlock = requireMatchingReady(auth.user);
      if (matchingBlock) return matchingBlock;
      const limit = await rateLimitResponse(store, "invites:create", auth.user.id, LIMITS.inviteUser);
      if (limit) return limit;

      const parse = createInviteSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);
      const textSourceError = await validateOwnedTextSource(store, auth.user.id, parse.data.textSourceId);
      if (textSourceError) return textSourceError;
      if (parse.data.scheduleWindows && !parseAvailability(parse.data.scheduleWindows)) {
        return json({ message: "Choose a valid meeting time or leave it blank" }, 400);
      }

      const invite = await store.createDirectInvite(auth.user.id, inviteToken(), parse.data);
      return json({ invite });
    }

    if (segments[0] === "invites" && segments[1] && request.method === "GET") {
      const invite = await store.getDirectInviteByToken(segments[1]);
      if (!invite) return json({ message: "Invite not found" }, 404);
      return json({ invite });
    }

    if (segments[0] === "invites" && segments[1] && segments[2] === "accept" && request.method === "POST") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const matchingBlock = requireMatchingReady(auth.user);
      if (matchingBlock) return matchingBlock;
      const limit = await rateLimitResponse(store, "invites:accept", auth.user.id, LIMITS.acceptUser);
      if (limit) return limit;

      const invite = await store.getDirectInviteByToken(segments[1]);
      if (!invite) return json({ message: "Invite not found" }, 404);
      if (invite.status !== "open") return json({ message: "This invite has already been used." }, 409);
      if (invite.inviterId === auth.user.id) return json({ message: "Send this invite to someone else." }, 400);

      const inviter = await store.getUser(invite.inviterId);
      if (!inviter || inviter.matchingSuspendedAt) return json({ message: "This invite is no longer available." }, 400);

      const pairing = await store.createPairing({
        userAId: invite.inviterId,
        userBId: auth.user.id,
        textTitle: invite.textTitle,
        textSourceId: invite.textSourceId,
        pace: invite.pace,
      });
      const accepted = await store.acceptDirectInvite(invite.id, pairing.id);
      if (!accepted) return json({ message: "This invite has already been used." }, 409);
      await Promise.all([
        store.closeUserOpenRequest(invite.inviterId),
        store.closeUserOpenRequest(auth.user.id),
        store.createSession(pairing.id),
      ]);
      return json({ pairing, invite: accepted });
    }

    if (request.method === "GET" && path === "/admin/requests") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const maintainerBlock = requireMaintainer(auth.user, env);
      if (maintainerBlock) return maintainerBlock;

      const suspended = await store.getSuspendedUserIds();
      const requests = (await store.getOpenRequestsWithUsers()).filter((item) => !suspended.has(item.userId));
      return json({ requests });
    }

    if (request.method === "POST" && path === "/admin/pairings") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const maintainerBlock = requireMaintainer(auth.user, env);
      if (maintainerBlock) return maintainerBlock;

      const parse = manualPairSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);
      if (parse.data.requestAId === parse.data.requestBId) {
        return json({ message: "Choose two different requests." }, 400);
      }

      const [a, b, suspended] = await Promise.all([
        store.getOpenRequestWithUser(parse.data.requestAId),
        store.getOpenRequestWithUser(parse.data.requestBId),
        store.getSuspendedUserIds(),
      ]);
      if (!a || !b) return json({ message: "One of those requests is no longer open." }, 404);
      if (a.userId === b.userId) return json({ message: "Choose requests from two different people." }, 400);
      if (suspended.has(a.userId) || suspended.has(b.userId)) {
        return json({ message: "One of those accounts is paused from matching." }, 400);
      }

      const pairing = await store.createPairing({
        userAId: a.userId,
        userBId: b.userId,
        textTitle: parse.data.textTitle?.trim() || (a.textTitle === b.textTitle ? a.textTitle : `${a.textTitle} / ${b.textTitle}`),
        textSourceId: a.textSourceId ?? b.textSourceId,
        pace: a.pace === b.pace ? a.pace : a.pace,
      });
      await Promise.all([store.closeRequest(a.id), store.closeRequest(b.id), store.createSession(pairing.id)]);
      return json({ pairing });
    }

    if (request.method === "GET" && path === "/pairings/active") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const pairing = (await store.getActivePairingForUser(auth.user.id)) ?? null;
      let partner = null;
      if (pairing) {
        const partnerId = pairing.userAId === auth.user.id ? pairing.userBId : pairing.userAId;
        partner = await store.getUser(partnerId);
      }
      return json({ pairing, partner });
    }

    if (request.method === "GET" && path === "/pairings") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const pairings = await store.getPairingsForUser(auth.user.id);
      const enriched = await Promise.all(
        pairings.map(async (pairing) => {
          const partnerId = pairing.userAId === auth.user.id ? pairing.userBId : pairing.userAId;
          const partner = await store.getUser(partnerId);
          const sessionCount = (await store.getSessionsForPairing(pairing.id)).length;
          return { pairing, partner, sessionCount };
        })
      );
      return json({ pairings: enriched });
    }

    if (request.method === "GET" && path === "/hum") {
      const [activePairs, finishedThisWeek, openInQueue] = await Promise.all([
        store.countActivePairings(),
        store.countCompletedThisWeek(),
        store.countOpenRequests(),
      ]);
      return json({ activePairs, finishedThisWeek, openInQueue });
    }

    if (request.method === "POST" && path === "/demo/seed-partner") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;
      const matchingBlock = requireMatchingReady(auth.user);
      if (matchingBlock) return matchingBlock;
      const limit = await rateLimitResponse(store, "demo:seed-partner", auth.user.id, LIMITS.demoUser);
      if (limit) return limit;

      const body = (await readJson(request)) as Record<string, unknown>;
      const partnerEmail = `demo-${Date.now()}@pilpul.local`;
      const partner = await store.upsertUserByEmail(partnerEmail);
      await store.updateUserProfile(partner.id, {
        firstName: typeof body.firstName === "string" ? body.firstName : "David",
        city: typeof body.city === "string" ? body.city : "Lisbon",
        timezone: "Europe/Lisbon",
        ageConfirmed: true,
      });
      const text = typeof body.text === "string" ? body.text : "Meditations - Marcus Aurelius";
      const pace = body.pace === "slow" || body.pace === "fast" ? body.pace : "medium";
      const commitment = body.commitment === "casual" ? "casual" : "serious";

      await store.createRequest(partner.id, {
        textTitle: text,
        pace,
        commitment,
        scheduleWindows: JSON.stringify({
          timezone: "UTC",
          windows: [{ day: 1, start: "19:00", end: "21:00" }],
        }),
        language: "English",
      });
      await store.createRequest(auth.user.id, {
        textTitle: text,
        pace,
        commitment,
        scheduleWindows: JSON.stringify({
          timezone: "UTC",
          windows: [{ day: 1, start: "19:00", end: "21:00" }],
        }),
        language: "English",
      });
      await runMatching(store);
      return json({ ok: true });
    }

    if (segments[0] === "pairings" && segments[1]) {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const pairing = await store.getPairing(segments[1]);
      if (!pairing || (pairing.userAId !== auth.user.id && pairing.userBId !== auth.user.id)) {
        return json({ message: "Not found" }, 404);
      }

      if (request.method === "GET" && segments.length === 2) {
        const partnerId = pairing.userAId === auth.user.id ? pairing.userBId : pairing.userAId;
        const partner = await store.getUser(partnerId);
        const sessions = await store.getSessionsForPairing(pairing.id);
        let readingText = null;
        if (pairing.textSourceId) {
          const text = await store.getReadingText(pairing.textSourceId);
          if (text) {
            readingText = {
              ...text,
              signedUrl: await store.createReadingTextSignedUrl(text.id),
            };
          }
        }
        return json({ pairing, partner, sessions, readingText });
      }

      if (segments[2] === "notebook") {
        if (request.method === "GET") {
          return json({
            content: pairing.notebookContent ?? "",
            updatedAt: pairing.notebookUpdatedAt ?? null,
          });
        }

        if (request.method === "PUT") {
          const parse = z
            .object({
              content: z.string().max(200_000, "Notebook is too large"),
              baseUpdatedAt: z.string().nullable().optional(),
            })
            .safeParse(await readJson(request));
          if (!parse.success) return json({ message: "Invalid body" }, 400);
          const updated = await store.updateNotebook(pairing.id, parse.data.content, parse.data.baseUpdatedAt);
          if (!updated && parse.data.baseUpdatedAt) {
            const current = await store.getPairing(pairing.id);
            return json(
              {
                message: "Notebook changed on another device.",
                content: current?.notebookContent ?? "",
                updatedAt: current?.notebookUpdatedAt ?? null,
              },
              409
            );
          }
          return json({
            content: updated?.notebookContent ?? "",
            updatedAt: updated?.notebookUpdatedAt ?? null,
          });
        }
      }

      if (request.method === "POST" && segments[2] === "end") {
        const body = (await readJson(request)) as Record<string, unknown>;
        const status = body.status === "completed" ? "completed" : "dissolved";
        await store.endPairing(pairing.id, status);
        return json({ ok: true });
      }

      if (request.method === "POST" && segments[2] === "report") {
        const limit = await rateLimitResponse(store, "reports:create", auth.user.id, LIMITS.reportUser);
        if (limit) return limit;

        const parse = createReportSchema.safeParse(await readJson(request));
        if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);
        const report = await store.createReport(auth.user.id, pairing.id, parse.data);
        await store.endPairing(pairing.id, "dissolved");
        return json({ report });
      }
    }

    return json({ message: "Not found" }, 404);
  } catch (error) {
    console.error("Pilpul API error", error);
    return json({ message: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
};

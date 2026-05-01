import { z } from "zod";
import { createStorage, type IStorage } from "../../server/storage";
import { runMatching } from "../../server/matching";
import {
  claimEmailSchema,
  insertRequestSchema,
  profileSchema,
} from "../../shared/schema";

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) return {};
  return await request.json();
}

function getVisitorId(request: Request): string {
  return request.headers.get("x-visitor-id") || "anon";
}

async function getCurrentUser(store: IStorage, request: Request) {
  return await store.getUserForVisitor(getVisitorId(request));
}

async function requireUser(store: IStorage, request: Request) {
  const user = await getCurrentUser(store, request);
  if (!user) {
    return { user: null, response: json({ message: "Not signed in" }, 401) };
  }
  return { user, response: null };
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

    if (request.method === "POST" && path === "/claim-email") {
      const parse = claimEmailSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const user = await store.upsertUserByEmail(parse.data.email);
      await store.linkVisitorToUser(getVisitorId(request), user.id);
      return json({ user });
    }

    if (request.method === "POST" && path === "/sign-out") {
      await store.unlinkVisitor(getVisitorId(request));
      return json({ ok: true });
    }

    if (request.method === "PATCH" && path === "/me") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const parse = profileSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const updated = await store.updateUserProfile(auth.user.id, parse.data);
      return json({ user: updated });
    }

    if (request.method === "GET" && path === "/requests/mine") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const open = (await store.getUserOpenRequest(auth.user.id)) ?? null;
      return json({ request: open });
    }

    if (request.method === "POST" && path === "/requests") {
      const auth = await requireUser(store, request);
      if (auth.response) return auth.response;

      const parse = insertRequestSchema.safeParse(await readJson(request));
      if (!parse.success) return json({ message: parse.error.issues[0].message }, 400);

      const partnerRequest = await store.createRequest(auth.user.id, parse.data);
      await runMatching(store);
      return json({ request: partnerRequest });
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
        scheduleWindows: "Weekday evenings",
        language: "English",
      });
      await store.createRequest(auth.user.id, {
        textTitle: text,
        pace,
        commitment,
        scheduleWindows: "Weekday evenings",
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
        return json({ pairing, partner, sessions });
      }

      if (segments[2] === "notebook") {
        if (request.method === "GET") {
          return json({
            content: pairing.notebookContent ?? "",
            updatedAt: pairing.notebookUpdatedAt ?? null,
          });
        }

        if (request.method === "PUT") {
          const parse = z.object({ content: z.string() }).safeParse(await readJson(request));
          if (!parse.success) return json({ message: "Invalid body" }, 400);
          const updated = await store.updateNotebook(pairing.id, parse.data.content);
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
    }

    return json({ message: "Not found" }, 404);
  } catch (error) {
    console.error("Pilpul API error", error);
    return json({ message: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
};

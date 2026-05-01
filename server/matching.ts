import { getStorage, type IStorage } from "./storage";
import type { Request as PartnerRequest } from "@shared/schema";

// Greedy matcher. Pairs users on:
//   - same commitment level (hard requirement)
//   - text affinity (same exact title scores highest)
//   - same pace bracket (preferred, not required)
// Returns the number of pairings created.
export async function runMatching(store?: IStorage): Promise<number> {
  store ??= getStorage();
  const open = await store.getOpenRequests();
  const taken = new Set<string>();
  let created = 0;

  // Sort by created_at so longest-waiting matches first
  open.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  for (const a of open) {
    if (taken.has(a.id)) continue;

    let best: { req: PartnerRequest; score: number } | null = null;
    for (const b of open) {
      if (b.id === a.id || taken.has(b.id)) continue;
      if (a.userId === b.userId) continue;

      // Hard: commitment must match (the most important variable per spec)
      if (a.commitment !== b.commitment) continue;

      let score = 0;
      const at = a.textTitle.trim().toLowerCase();
      const bt = b.textTitle.trim().toLowerCase();
      if (at === bt) score += 100;
      else if (at.length && bt.length && (at.includes(bt) || bt.includes(at))) score += 60;
      else {
        // shared meaningful word
        const aw = new Set(at.split(/\W+/).filter((w) => w.length > 3));
        const bw = bt.split(/\W+/).filter((w) => w.length > 3);
        if (bw.some((w) => aw.has(w))) score += 30;
      }

      // Pace affinity
      const paceOrder = { slow: 0, medium: 1, fast: 2 } as const;
      const dp = Math.abs(paceOrder[a.pace as keyof typeof paceOrder] - paceOrder[b.pace as keyof typeof paceOrder]);
      score += dp === 0 ? 20 : dp === 1 ? 8 : 0;

      // Language overlap
      if ((a.language ?? "").toLowerCase() === (b.language ?? "").toLowerCase()) score += 5;

      if (!best || score > best.score) best = { req: b, score };
    }

    if (best && best.score >= 20) {
      const pairing = await store.createPairing({
        userAId: a.userId,
        userBId: best.req.userId,
        // prefer the more specific (longer) title
        textTitle: a.textTitle.length >= best.req.textTitle.length ? a.textTitle : best.req.textTitle,
        pace: a.pace,
      });
      await store.closeRequest(a.id);
      await store.closeRequest(best.req.id);
      taken.add(a.id);
      taken.add(best.req.id);
      created += 1;
      // Auto-create the first session so the pair has somewhere to land.
      await store.createSession(pairing.id);
    }
  }

  return created;
}

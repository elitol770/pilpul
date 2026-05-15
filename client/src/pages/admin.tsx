import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAvailabilitySummary } from "@shared/availability";
import type { Pairing, RequestWithUser } from "@shared/schema";

export default function Admin() {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdPairing, setCreatedPairing] = useState<Pairing | null>(null);
  const { data, error, isLoading } = useQuery<{ requests: RequestWithUser[] }>({
    queryKey: ["/api/admin/requests"],
    retry: false,
  });

  const requests = data?.requests ?? [];

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current.slice(-1), id];
    });
  }

  async function pair() {
    if (selected.length !== 2) return;
    setBusy(true);
    setErr(null);
    setCreatedPairing(null);
    try {
      const response = await apiRequest("POST", "/api/admin/pairings", {
        requestAId: selected[0],
        requestBId: selected[1],
        textTitle: title.trim() || undefined,
      });
      const body = (await response.json()) as { pairing: Pairing };
      setCreatedPairing(body.pairing);
      setSelected([]);
      setTitle("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/requests"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/hum"] }),
      ]);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not pair requests");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="pt-4">
        <span className="smallcaps">maintainer</span>
        <h1 className="font-serif text-xl mt-1">Manual pairing.</h1>
        <p className="text-muted-foreground mt-2">
          Select two open requests and create a room for them. This is for early liquidity, not a
          public feature.
        </p>

        <div className="rule mt-8" />

        {error ? (
          <div className="mt-8 border border-border bg-card rounded-sm p-5">
            <p className="font-serif italic text-lg">Maintainer access is not enabled.</p>
            <p className="text-muted-foreground mt-2">
              Set <code className="font-mono text-xs">MAINTAINER_EMAILS</code> in Cloudflare Pages
              to the maintainer email address, then sign in with that email.
            </p>
          </div>
        ) : isLoading ? (
          <p className="text-muted-foreground italic mt-8">loading requests...</p>
        ) : (
          <>
            <div className="mt-6 border-y border-border py-4">
              <label className="smallcaps block mb-2">shared title override</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional"
                className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={pair}
                  disabled={busy || selected.length !== 2}
                  data-testid="button-admin-pair"
                  className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic disabled:opacity-50"
                >
                  {busy ? "pairing..." : "pair selected"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {selected.length} of 2 selected
                </span>
              </div>
              {err && <p className="text-destructive text-sm mt-3">{err}</p>}
              {createdPairing && (
                <p className="text-sm text-muted-foreground mt-3">
                  Created room for{" "}
                  <span className="font-serif italic">{createdPairing.textTitle}</span>.
                </p>
              )}
            </div>

            {requests.length === 0 ? (
              <p className="font-serif italic mt-8 text-muted-foreground">No open requests.</p>
            ) : (
              <ul className="divide-y divide-border" role="list">
                {requests.map((request) => (
                  <li key={request.id} className="py-5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.includes(request.id)}
                        onChange={() => toggle(request.id)}
                        className="mt-2"
                      />
                      <span className="block flex-1">
                        <span className="font-serif italic text-lg block">{request.textTitle}</span>
                        <span className="text-muted-foreground text-sm block mt-1">
                          {request.user.firstName ?? "Someone"}
                          {request.user.city ? `, ${request.user.city}` : ""} · {request.pace} ·{" "}
                          {request.commitment} · {request.language ?? "English"}
                        </span>
                        <span className="text-muted-foreground text-xs block mt-2">
                          {request.scheduleWindows
                            ? formatAvailabilitySummary(request.scheduleWindows)
                            : "Schedule not specified"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

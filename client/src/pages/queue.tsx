import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { IncomingInterests } from "@/components/incoming-interests";
import { PageShell } from "@/components/page-shell";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAvailabilitySummary } from "@shared/availability";

export default function Queue() {
  const [, setLocation] = useLocation();
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: mine } = useQuery<{
    request: {
      id: string;
      textTitle: string;
      pace: string;
      commitment: string;
      scheduleWindows: string | null;
      language: string;
    } | null;
  }>({
    queryKey: ["/api/requests/mine"],
    refetchInterval: 4000,
  });

  const { data: active } = useQuery<{ pairing: { id: string } | null }>({
    queryKey: ["/api/pairings/active"],
    refetchInterval: 4000,
  });

  // If matched while waiting, send them home so they see the active pairing card.
  useEffect(() => {
    if (active?.pairing) {
      queryClient.invalidateQueries({ queryKey: ["/api/pairings/active"] });
      setLocation("/");
    }
  }, [active?.pairing, setLocation]);

  if (!mine?.request) {
    return (
      <PageShell narrow>
        <div className="pt-8">
          <p className="font-serif italic text-lg">You don't have a request open.</p>
          <Link href="/find" className="text-sm underline underline-offset-4 mt-3 inline-block">
            find a partner
          </Link>
        </div>
      </PageShell>
    );
  }

  const r = mine.request;

  async function closeRequest() {
    setClosing(true);
    setErr(null);
    try {
      await apiRequest("POST", "/api/requests/mine/close", {});
      await queryClient.invalidateQueries({ queryKey: ["/api/requests/mine"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/hum"] });
      setLocation("/");
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not close request");
    } finally {
      setClosing(false);
    }
  }

  return (
    <PageShell narrow>
      <div className="pt-8 text-center">
        <span className="smallcaps">in the queue</span>
        <div className="my-8 flex justify-center">
          <span
            className="block w-3 h-3 rounded-full bg-primary opacity-70"
            style={{ animation: "pulse 2.4s ease-in-out infinite" }}
          />
        </div>
        <p
          className="font-serif italic leading-relaxed max-w-md mx-auto"
          data-testid="text-queue-summary"
        >
          Looking for someone who wants to read{" "}
          <span className="text-foreground">{r.textTitle}</span> at a {r.pace} pace
          {r.scheduleWindows ? `, ${formatAvailabilitySummary(r.scheduleWindows)}` : ""}.
        </p>
        <IncomingInterests
          className="mt-10 text-left"
          onAccepted={(pairing) => setLocation(`/room/${pairing.id}`)}
        />
        <div className="rule mt-10 mb-6" />
        <p className="text-xs text-muted-foreground italic max-w-sm mx-auto">
          Your place is held. Check back later after you close this page.
        </p>
        {err && <p className="text-destructive text-sm mt-4">{err}</p>}
        <div className="mt-6 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-block px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
            data-testid="button-close"
          >
            close
          </Link>
          <button
            type="button"
            onClick={closeRequest}
            disabled={closing}
            className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-50"
            data-testid="button-cancel-request"
          >
            {closing ? "leaving…" : "leave the queue"}
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:1; transform:scale(1.2) } }`}</style>
    </PageShell>
  );
}

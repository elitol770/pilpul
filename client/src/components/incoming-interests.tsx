import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  Pairing,
  Request as PartnerRequest,
  RequestInterestWithRequester,
} from "@shared/schema";

type InterestResponse = {
  request: PartnerRequest | null;
  interests: RequestInterestWithRequester[];
};

export function IncomingInterests({
  className = "",
  onAccepted,
}: {
  className?: string;
  onAccepted?: (pairing: Pairing) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, isLoading } = useQuery<InterestResponse>({
    queryKey: ["/api/requests/mine/interests"],
    refetchInterval: 5000,
  });

  const request = data?.request ?? null;
  const interests = data?.interests ?? [];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/requests/mine/interests"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/requests/open"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/requests/mine"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/pairings/active"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/hum"] }),
    ]);
  }

  async function accept(interestId: string) {
    setBusyId(interestId);
    setErr(null);
    try {
      const response = await apiRequest("POST", `/api/request-interests/${interestId}/accept`, {});
      const body = (await response.json()) as { pairing: Pairing };
      await refresh();
      onAccepted?.(body.pairing);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not accept request");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(interestId: string) {
    setBusyId(interestId);
    setErr(null);
    try {
      await apiRequest("POST", `/api/request-interests/${interestId}/decline`, {});
      await refresh();
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not decline request");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !request || interests.length === 0) return null;

  return (
    <section
      className={`border-y border-border py-5 ${className}`.trim()}
      data-testid="section-incoming-interests"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <span className="smallcaps">people interested</span>
          <p className="font-serif italic text-lg mt-1">{request.textTitle}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {interests.length} {interests.length === 1 ? "person" : "people"} asked to read this too.
        </p>
      </div>

      {err && <p className="text-destructive text-sm mt-4">{err}</p>}

      <ul className="divide-y divide-border mt-4" role="list">
        {interests.map((interest) => (
          <li key={interest.id} className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-serif italic">
                  {interest.requester.firstName ?? "Someone"}
                  {interest.requester.city ? `, ${interest.requester.city}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  wants to read this with you
                  {interest.requester.timezone ? ` · ${interest.requester.timezone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => accept(interest.id)}
                  disabled={busyId !== null}
                  data-testid={`button-accept-interest-${interest.id}`}
                  className="px-3 py-1.5 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm"
                >
                  {busyId === interest.id ? "opening..." : "accept"}
                </button>
                <button
                  type="button"
                  onClick={() => decline(interest.id)}
                  disabled={busyId !== null}
                  data-testid={`button-decline-interest-${interest.id}`}
                  className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-50"
                >
                  decline
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

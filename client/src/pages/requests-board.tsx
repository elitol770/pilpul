import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { IncomingInterests } from "@/components/incoming-interests";
import { PageShell } from "@/components/page-shell";
import { ProfileFormCard } from "@/components/profile-form-card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatAvailabilitySummary } from "@shared/availability";
import type { RequestWithUser } from "@shared/schema";

export default function RequestsBoard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ requests: RequestWithUser[] }>({
    queryKey: ["/api/requests/open"],
    refetchInterval: 8000,
  });

  const needsProfile = user && (!user.firstName || !user.city || !user.ageConfirmed);
  const requests = data?.requests ?? [];

  async function sendInterest(id: string) {
    setBusyId(id);
    setErr(null);
    try {
      await apiRequest("POST", `/api/requests/${id}/interests`, {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/requests/open"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/requests/mine/interests"] }),
      ]);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not send request");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelInterest(interestId: string) {
    setBusyId(interestId);
    setErr(null);
    try {
      await apiRequest("POST", `/api/request-interests/${interestId}/cancel`, {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/requests/open"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/requests/mine/interests"] }),
      ]);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not cancel request");
    } finally {
      setBusyId(null);
    }
  }

  if (user?.matchingSuspendedAt) {
    return (
      <PageShell narrow>
        <div className="border border-border bg-card rounded-sm p-6 mt-4">
          <span className="smallcaps">matching paused</span>
          <p className="font-serif italic text-xl mt-1">You cannot accept requests right now.</p>
          <p className="text-muted-foreground mt-2">
            A report needs maintainer review before this account can be matched again.
          </p>
        </div>
      </PageShell>
    );
  }

  if (needsProfile) {
    return (
      <PageShell narrow>
        <ProfileFormCard />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="pt-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <span className="smallcaps">open requests</span>
            <h1 className="font-serif text-xl mt-1">People looking for a partner.</h1>
            <p className="text-muted-foreground mt-2">
              This is a list, not a feed. If a text fits, ask to read it too.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/find"
              className="px-4 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic w-fit"
            >
              post a request
            </Link>
            <Link
              href="/create"
              className="px-4 py-2 border border-border rounded-sm hover-elevate w-fit"
            >
              private room
            </Link>
          </div>
        </div>

        <IncomingInterests
          className="mt-7"
          onAccepted={(pairing) => setLocation(`/room/${pairing.id}`)}
        />

        <div className="rule mt-8" />
        {err && <p className="text-destructive text-sm mt-4">{err}</p>}

        {isLoading ? (
          <p className="text-muted-foreground italic mt-8">checking the board...</p>
        ) : requests.length === 0 ? (
          <div className="mt-8">
            <p className="font-serif italic text-lg">No open requests right now.</p>
            <p className="text-muted-foreground mt-2">
              Create an invite link for someone you know, or enter the queue so the next person can
              find you here.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/find"
                className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
              >
                post a request
              </Link>
              <Link
                href="/create"
                className="px-5 py-2 border border-border rounded-sm hover-elevate"
              >
                create a room
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {requests.map((request) => (
              <li key={request.id} className="py-5" data-testid={`row-open-request-${request.id}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <p className="font-serif italic text-xl">{request.textTitle}</p>
                    <p className="text-muted-foreground mt-1">
                      {request.user.firstName ?? "Someone"}
                      {request.user.city ? `, ${request.user.city}` : ""} · {request.pace} ·{" "}
                      {request.commitment}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {request.scheduleWindows
                        ? formatAvailabilitySummary(request.scheduleWindows)
                        : "Schedule not specified"}{" "}
                      · {request.language ?? "English"}
                    </p>
                    {!!request.pendingInterestCount && (
                      <p className="text-xs text-muted-foreground italic mt-2">
                        {request.pendingInterestCount}{" "}
                        {request.pendingInterestCount === 1 ? "person has" : "people have"} asked to
                        read this.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    {request.viewerInterestStatus === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled
                          data-testid={`button-request-sent-${request.id}`}
                          className="px-4 py-2 border border-border bg-card rounded-sm font-serif italic w-fit opacity-75"
                        >
                          request sent
                        </button>
                        {request.viewerInterestId && (
                          <button
                            type="button"
                            onClick={() => cancelInterest(request.viewerInterestId!)}
                            disabled={busyId !== null}
                            className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-50"
                          >
                            cancel
                          </button>
                        )}
                      </>
                    ) : request.viewerInterestStatus === "accepted" ? (
                      <Link
                        href="/"
                        className="px-4 py-2 border border-border bg-card rounded-sm font-serif italic w-fit"
                      >
                        accepted
                      </Link>
                    ) : request.viewerInterestStatus === "declined" ? (
                      <button
                        type="button"
                        disabled
                        className="px-4 py-2 border border-border bg-card rounded-sm font-serif italic w-fit opacity-60"
                      >
                        declined
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendInterest(request.id)}
                        disabled={busyId !== null}
                        data-testid={`button-request-interest-${request.id}`}
                        className="px-4 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic w-fit"
                      >
                        {busyId === request.id ? "sending..." : "I want to read this too"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

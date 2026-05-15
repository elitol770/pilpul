import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { EmailClaimForm } from "@/components/email-claim-form";
import { PageShell } from "@/components/page-shell";
import { ProfileFormCard } from "@/components/profile-form-card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DirectInviteWithInviter, Pairing } from "@shared/schema";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ invite: DirectInviteWithInviter }>({
    queryKey: ["/api/invites", token],
    retry: false,
  });

  const invite = data?.invite ?? null;
  const needsProfile = user && (!user.firstName || !user.city || !user.ageConfirmed);

  async function acceptInvite() {
    setBusy(true);
    setErr(null);
    try {
      const response = await apiRequest("POST", `/api/invites/${token}/accept`, {});
      const body = (await response.json()) as { pairing: Pairing };
      await queryClient.invalidateQueries({ queryKey: ["/api/pairings/active"] });
      setLocation(`/room/${body.pairing.id}`);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <PageShell narrow>
        <p className="text-muted-foreground italic pt-8">opening invite...</p>
      </PageShell>
    );
  }

  if (!invite) {
    return (
      <PageShell narrow>
        <div className="pt-8">
          <p className="font-serif italic text-xl">This invite was not found.</p>
          <Link href="/" className="inline-block mt-4 text-sm underline underline-offset-4">
            return home
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell narrow>
      <div className="pt-4">
        <span className="smallcaps">study invite</span>
        <h1 className="font-serif italic text-2xl mt-1">{invite.textTitle}</h1>
        <p className="text-muted-foreground mt-3">
          {invite.inviter.firstName ?? "Someone"}
          {invite.inviter.city ? ` in ${invite.inviter.city}` : ""} invited you to study this text
          together.
        </p>

        <div className="border-y border-border py-4 mt-6 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="smallcaps block">pace</span>
            <p className="font-serif italic mt-1">{invite.pace}</p>
          </div>
          <div>
            <span className="smallcaps block">commitment</span>
            <p className="font-serif italic mt-1">{invite.commitment}</p>
          </div>
          <div>
            <span className="smallcaps block">language</span>
            <p className="font-serif italic mt-1">{invite.language ?? "English"}</p>
          </div>
        </div>

        {invite.status !== "open" ? (
          <div className="mt-8">
            <p className="font-serif italic text-lg">This invite has already been used.</p>
            <Link
              href="/requests"
              className="inline-block mt-4 text-sm underline underline-offset-4"
            >
              browse open requests
            </Link>
          </div>
        ) : !user ? (
          <div className="mt-8">
            <p className="font-serif italic text-lg">Enter your email to accept.</p>
            <EmailClaimForm />
          </div>
        ) : user.matchingSuspendedAt ? (
          <div className="mt-8 border border-border bg-card rounded-sm p-5">
            <span className="smallcaps">matching paused</span>
            <p className="text-muted-foreground mt-2">
              A report needs maintainer review before this account can accept invites.
            </p>
          </div>
        ) : needsProfile ? (
          <ProfileFormCard />
        ) : invite.inviterId === user.id ? (
          <div className="mt-8">
            <p className="font-serif italic text-lg">Send this invite to someone else.</p>
            <p className="text-muted-foreground mt-2">
              You created the invite. The room opens when another person accepts it.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            {err && <p className="text-destructive text-sm mb-3">{err}</p>}
            <button
              onClick={acceptInvite}
              disabled={busy}
              data-testid="button-accept-invite"
              className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
            >
              {busy ? "opening room..." : "accept and enter the room"}
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}

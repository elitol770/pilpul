import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { ProfileFormCard } from "@/components/profile-form-card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";

type ActivePairing = {
  pairing: {
    id: string;
    textTitle: string;
    pace: string | null;
    nextSessionAt: string | null;
    notebookContent: string;
  } | null;
  partner: {
    firstName: string | null;
    city: string | null;
    timezone: string | null;
  } | null;
};

type Hum = { activePairs: number; finishedThisWeek: number; openInQueue: number };

export default function Home() {
  const { user } = useAuth();
  const { data: active } = useQuery<ActivePairing>({
    queryKey: ["/api/pairings/active"],
  });
  const { data: queueMine } = useQuery<{ request: { id: string } | null }>({
    queryKey: ["/api/requests/mine"],
  });
  const { data: hum } = useQuery<Hum>({ queryKey: ["/api/hum"] });
  const [seeding, setSeeding] = useState(false);

  const needsProfile = user && (!user.firstName || !user.city || !user.ageConfirmed);
  const matchingSuspended = !!user?.matchingSuspendedAt;

  async function seedDemo() {
    setSeeding(true);
    try {
      await apiRequest("POST", "/api/demo/seed-partner", {});
      await queryClient.invalidateQueries({ queryKey: ["/api/pairings/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/hum"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/requests/mine"] });
    } finally {
      setSeeding(false);
    }
  }

  return (
    <PageShell narrow>
      {matchingSuspended ? (
        <PausedCard />
      ) : needsProfile ? (
        <ProfileFormCard />
      ) : active?.pairing ? (
        <ActiveCard pairing={active.pairing} partner={active.partner} />
      ) : queueMine?.request ? (
        <WaitingCard />
      ) : (
        <EmptyCard onSeedDemo={seedDemo} seeding={seeding} />
      )}

      {!matchingSuspended && !needsProfile && (
        <div className="mt-10 grid grid-cols-2 gap-4">
          <Link
            href="/find"
            className="block border border-border bg-card rounded-sm p-4 hover-elevate"
            data-testid="link-find-another"
          >
            <span className="smallcaps">Find</span>
            <p className="font-serif italic mt-1">another partner</p>
          </Link>
          <Link
            href="/notebook"
            className="block border border-border bg-card rounded-sm p-4 hover-elevate"
            data-testid="link-notebook"
          >
            <span className="smallcaps">Read</span>
            <p className="font-serif italic mt-1">your notebook</p>
          </Link>
        </div>
      )}

      {hum && (
        <p
          className="text-center text-muted-foreground italic mt-16 text-sm"
          data-testid="text-hum"
        >
          {hum.activePairs} {hum.activePairs === 1 ? "pair" : "pairs"} studying right now.{" "}
          {hum.finishedThisWeek} {hum.finishedThisWeek === 1 ? "pair" : "pairs"} finished a book
          this week.
        </p>
      )}
    </PageShell>
  );
}

function PausedCard() {
  return (
    <div
      className="border border-border bg-card rounded-sm p-6 mt-4"
      data-testid="card-matching-paused"
    >
      <span className="smallcaps">matching paused</span>
      <p className="font-serif italic text-xl mt-1">This account is out of the queue.</p>
      <p className="text-muted-foreground mt-2">
        A report needs maintainer review before this account can be matched again.
      </p>
      <Link href="/notebook" className="inline-block mt-5 text-sm underline underline-offset-4">
        open your notebook
      </Link>
    </div>
  );
}

function ActiveCard({
  pairing,
  partner,
}: {
  pairing: { id: string; textTitle: string; pace: string | null };
  partner: { firstName: string | null; city: string | null } | null;
}) {
  return (
    <div className="border border-border bg-card rounded-sm p-6 mt-4" data-testid="card-active">
      <span className="smallcaps">currently reading</span>
      <p className="font-serif italic text-xl mt-1" data-testid="text-pairing-title">
        {pairing.textTitle}
      </p>
      <p className="text-muted-foreground mt-2">
        with{" "}
        <span className="text-foreground">
          {partner?.firstName ?? "your partner"}
          {partner?.city ? `, ${partner.city}` : ""}
        </span>
        {pairing.pace ? ` · ${pairing.pace} pace` : ""}
      </p>

      <div className="rule my-5" />

      <Link
        href={`/room/${pairing.id}`}
        className="inline-block px-5 py-2 border border-border bg-background hover-elevate active-elevate-2 rounded-sm font-serif italic"
        data-testid="button-enter-room"
      >
        enter the room
      </Link>
    </div>
  );
}

function WaitingCard() {
  return (
    <div className="border border-border bg-card rounded-sm p-6 mt-4" data-testid="card-waiting">
      <span className="smallcaps">in the queue</span>
      <p className="font-serif italic text-xl mt-1">looking for someone</p>
      <p className="text-muted-foreground mt-2">
        Your request is open. Check back later, or leave the queue open while matching runs.
      </p>
      <div className="rule my-5" />
      <Link
        href="/queue"
        className="inline-block text-sm underline underline-offset-4"
        data-testid="link-view-queue"
      >
        view your request
      </Link>
    </div>
  );
}

function EmptyCard({ onSeedDemo, seeding }: { onSeedDemo: () => void; seeding: boolean }) {
  return (
    <div className="mt-4">
      <p className="font-serif text-lg leading-relaxed" data-testid="text-empty">
        You're not currently studying with anyone.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/create"
          className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
          data-testid="button-create-room"
        >
          create a room
        </Link>
        <Link
          href="/find"
          className="text-sm underline underline-offset-4"
          data-testid="button-find-partner"
        >
          enter the queue
        </Link>
        <Link href="/requests" className="text-sm underline underline-offset-4">
          browse open requests
        </Link>
        <button
          onClick={onSeedDemo}
          disabled={seeding}
          data-testid="button-seed-demo"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          {seeding ? "pairing…" : "or pair with a sample partner to try the room"}
        </button>
      </div>
    </div>
  );
}

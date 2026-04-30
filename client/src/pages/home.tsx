import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
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

  const needsProfile = user && (!user.firstName || !user.city);

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
      {needsProfile && <ProfileForm />}

      {active?.pairing ? (
        <ActiveCard pairing={active.pairing} partner={active.partner} />
      ) : queueMine?.request ? (
        <WaitingCard />
      ) : (
        <EmptyCard onSeedDemo={seedDemo} seeding={seeding} />
      )}

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
        We'll email you when there is something to do. You don't need to come back.
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
          href="/find"
          className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
          data-testid="button-find-partner"
        >
          find a partner
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

function ProfileForm() {
  const [firstName, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await apiRequest("PATCH", "/api/me", {
        firstName,
        city,
        timezone: tz,
        ageConfirmed: confirmed,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-border bg-card rounded-sm p-6 mt-4">
      <span className="smallcaps">first, a name</span>
      <p className="font-serif italic mt-1 mb-4">
        Your partner sees your first name and city. Nothing else.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="smallcaps block mb-1">first name</label>
          <input
            data-testid="input-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="smallcaps block mb-1">city</label>
          <input
            data-testid="input-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            placeholder="Lisbon, Tokyo, Mexico City…"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground mt-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="checkbox-age"
            className="mt-1"
          />
          <span>I confirm I am 18 years of age or older.</span>
        </label>
      </div>
      {err && <p className="text-destructive text-sm mt-3">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        data-testid="button-save-profile"
        className="mt-5 px-5 py-2 border border-border bg-background hover-elevate active-elevate-2 rounded-sm font-serif italic"
      >
        {busy ? "saving…" : "continue"}
      </button>
    </form>
  );
}

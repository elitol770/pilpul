import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";

type Entry = {
  pairing: {
    id: string;
    textTitle: string;
    status: "active" | "completed" | "dissolved";
    startedAt: string;
    endedAt: string | null;
  };
  partner: { firstName: string | null; city: string | null } | null;
  sessionCount: number;
};

export default function Notebook() {
  const { data } = useQuery<{ pairings: Entry[] }>({ queryKey: ["/api/pairings"] });
  const items = data?.pairings ?? [];

  return (
    <PageShell>
      <div className="pt-4">
        <h1 className="font-serif text-xl mb-2">Your notebook.</h1>
        <p className="text-muted-foreground">
          Everything you've studied, with whom, and what you concluded.
        </p>

        <div className="rule mt-8" />

        {items.length === 0 ? (
          <p className="font-serif italic mt-10 text-muted-foreground">
            Nothing here yet. Your reading history appears after you start studying.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {items.map(({ pairing, partner, sessionCount }) => (
              <li key={pairing.id} className="py-5" data-testid={`row-pairing-${pairing.id}`}>
                <Link
                  href={`/room/${pairing.id}`}
                  className="block hover-elevate -mx-3 px-3 py-1 rounded-sm"
                >
                  <p className="font-serif italic text-lg">{pairing.textTitle}</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    with {partner?.firstName ?? "your partner"}
                    {partner?.city ? `, ${partner.city}` : ""} ·{" "}
                    <StatusLine pairing={pairing} sessions={sessionCount} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="rule mt-10" />
        <p className="text-xs text-muted-foreground italic mt-6 leading-relaxed max-w-md">
          Your notes are private by default. After finishing a text, you can choose to contribute
          anonymized notes to a public archive — future pairs reading the same book can see what
          previous pairs argued about.
        </p>
      </div>
    </PageShell>
  );
}

function StatusLine({ pairing, sessions }: { pairing: Entry["pairing"]; sessions: number }) {
  if (pairing.status === "active") {
    return <span>in progress · session {sessions || 1}</span>;
  }
  if (pairing.status === "completed") {
    const year = pairing.endedAt
      ? new Date(pairing.endedAt).getFullYear()
      : new Date().getFullYear();
    return (
      <span>
        finished · {sessions} {sessions === 1 ? "session" : "sessions"} · {year}
      </span>
    );
  }
  return <span>ended</span>;
}

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { PdfTextPicker } from "@/components/pdf-text-picker";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DAYS, encodeAvailability, type AvailabilityWindow } from "@shared/availability";

const PACES = [
  { value: "slow", label: "slow", desc: "~10 pp/wk" },
  { value: "medium", label: "medium", desc: "~25 pp/wk" },
  { value: "fast", label: "fast", desc: "~50 pp/wk" },
] as const;

const COMMITMENTS = [
  { value: "casual", label: "casual", desc: "show up when I can" },
  { value: "serious", label: "serious", desc: "I want to finish this" },
] as const;

type WindowDraft = AvailabilityWindow & { id: string };

function newWindow(day = 1): WindowDraft {
  return {
    id: crypto.randomUUID(),
    day,
    start: "19:00",
    end: "20:30",
  };
}

export default function FindPartner() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [textTitle, setTextTitle] = useState("");
  const [pace, setPace] = useState<"slow" | "medium" | "fast">("medium");
  const [commitment, setCommitment] = useState<"casual" | "serious">("serious");
  const [availability, setAvailability] = useState<WindowDraft[]>(() => [newWindow()]);
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [language, setLanguage] = useState("English");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const needsProfile = user && (!user.firstName || !user.city || !user.ageConfirmed);

  if (user?.matchingSuspendedAt) {
    return (
      <PageShell narrow>
        <div className="border border-border bg-card rounded-sm p-6 mt-4">
          <span className="smallcaps">matching paused</span>
          <p className="font-serif italic text-xl mt-1">You cannot enter the queue right now.</p>
          <p className="text-muted-foreground mt-2">
            A report needs maintainer review before this account can be matched again.
          </p>
          <Link href="/" className="inline-block mt-5 text-sm underline underline-offset-4">
            return home
          </Link>
        </div>
      </PageShell>
    );
  }

  if (needsProfile) {
    return (
      <PageShell narrow>
        <div className="border border-border bg-card rounded-sm p-6 mt-4">
          <span className="smallcaps">before matching</span>
          <p className="font-serif italic text-xl mt-1">Finish your name, city, and age confirmation.</p>
          <p className="text-muted-foreground mt-2">
            Your partner sees your first name and city. The 18+ confirmation is required before
            entering the queue.
          </p>
          <Link href="/" className="inline-block mt-5 text-sm underline underline-offset-4">
            finish profile
          </Link>
        </div>
      </PageShell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const windows = availability.map(({ id: _id, ...window }) => window);
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", "/api/requests", {
        textTitle,
        textSourceId: selectedTextId,
        pace,
        commitment,
        scheduleWindows: encodeAvailability({ timezone, windows }),
        language,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/requests/mine"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/pairings/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/hum"] });
      setLocation("/queue");
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  function addAvailabilityWindow() {
    setAvailability((current) => {
      const lastDay = current[current.length - 1]?.day ?? 0;
      return [...current, newWindow(lastDay + 1 > 6 ? 0 : lastDay + 1)];
    });
  }

  return (
    <PageShell narrow>
      <div className="pt-4">
        <span className="smallcaps">find a partner</span>
        <h1 className="font-serif text-xl mt-1 mb-2">What do you want to read?</h1>
        <p className="text-muted-foreground italic">
          Examples: "Nietzsche — Genealogy of Morals", "The Brothers Karamazov", "anything in
          moral philosophy", "Talmud, Berakhot."
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Already have someone in mind?{" "}
          <Link href="/create" className="underline underline-offset-4 text-foreground">
            Create an invite link
          </Link>
          . Want to start now?{" "}
          <Link href="/requests" className="underline underline-offset-4 text-foreground">
            Browse open requests
          </Link>
          .
        </p>

        <form onSubmit={submit} className="mt-8 space-y-8">
          <div>
            <label className="smallcaps block mb-2">the text</label>
            <input
              data-testid="input-text-title"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              required
              autoFocus
              className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            />
            <PdfTextPicker
              textTitle={textTitle}
              selectedTextId={selectedTextId}
              onSelectedTextIdChange={setSelectedTextId}
              onTitleSuggestion={(title) => setTextTitle(title)}
              description="Upload a private copy, or import a page that links to a PDF."
              uploadTestId="input-pdf-upload"
              urlTestId="input-pdf-url"
              fetchTestId="button-fetch-pdf"
              selectedTestId="text-selected-pdf"
            />
          </div>

          <div>
            <label className="smallcaps block mb-2">pace</label>
            <div className="grid grid-cols-3 gap-2">
              {PACES.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => setPace(p.value)}
                  data-testid={`button-pace-${p.value}`}
                  className={
                    "border rounded-sm py-3 px-3 text-left hover-elevate " +
                    (pace === p.value
                      ? "border-foreground bg-card"
                      : "border-border bg-card")
                  }
                >
                  <span className="font-serif italic block">{p.label}</span>
                  <span className="text-xs text-muted-foreground">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="smallcaps block mb-2">commitment</label>
            <div className="grid grid-cols-2 gap-2">
              {COMMITMENTS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setCommitment(c.value)}
                  data-testid={`button-commitment-${c.value}`}
                  className={
                    "border rounded-sm py-3 px-3 text-left hover-elevate " +
                    (commitment === c.value
                      ? "border-foreground bg-card"
                      : "border-border bg-card")
                  }
                >
                  <span className="font-serif italic block">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 italic">
              We never pair casual with serious. It always fails by week three.
            </p>
          </div>

          <div>
            <label className="smallcaps block mb-2">when can you meet?</label>
            <div className="space-y-3">
              {availability.map((window) => (
                <div key={window.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <select
                    value={window.day}
                    onChange={(e) =>
                      setAvailability((current) =>
                        current.map((item) =>
                          item.id === window.id ? { ...item, day: Number(e.target.value) } : item
                        )
                      )
                    }
                    data-testid={`select-day-${window.id}`}
                    className="min-w-0 bg-card border border-border rounded-sm px-2 py-2 outline-none focus:border-primary text-sm"
                  >
                    {DAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.short}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={window.start}
                    onChange={(e) =>
                      setAvailability((current) =>
                        current.map((item) =>
                          item.id === window.id ? { ...item, start: e.target.value } : item
                        )
                      )
                    }
                    data-testid={`input-start-${window.id}`}
                    className="min-w-0 bg-card border border-border rounded-sm px-2 py-2 outline-none focus:border-primary text-sm tabular"
                  />
                  <input
                    type="time"
                    value={window.end}
                    onChange={(e) =>
                      setAvailability((current) =>
                        current.map((item) =>
                          item.id === window.id ? { ...item, end: e.target.value } : item
                        )
                      )
                    }
                    data-testid={`input-end-${window.id}`}
                    className="min-w-0 bg-card border border-border rounded-sm px-2 py-2 outline-none focus:border-primary text-sm tabular"
                  />
                  <button
                    type="button"
                    aria-label="Remove time"
                    onClick={() =>
                      setAvailability((current) =>
                        current.length === 1 ? current : current.filter((item) => item.id !== window.id)
                      )
                    }
                    disabled={availability.length === 1}
                    className="h-10 w-10 inline-flex items-center justify-center border border-border rounded-sm bg-card hover-elevate disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={addAvailabilityWindow}
                disabled={availability.length >= 14}
                className="inline-flex items-center gap-2 text-sm underline underline-offset-4 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                add a time
              </button>
              <span className="text-xs text-muted-foreground tabular">{timezone}</span>
            </div>
          </div>

          <div>
            <label className="smallcaps block mb-2">language of conversation</label>
            <input
              data-testid="input-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            />
          </div>

          {err && <p className="text-destructive text-sm">{err}</p>}

          <div className="rule" />
          <button
            type="submit"
            disabled={busy}
            data-testid="button-enter-queue"
            className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
          >
            {busy ? "submitting…" : "enter the queue"}
          </button>
        </form>
      </div>
    </PageShell>
  );
}

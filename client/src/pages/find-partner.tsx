import { useState } from "react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";

const PACES = [
  { value: "slow", label: "slow", desc: "~10 pp/wk" },
  { value: "medium", label: "medium", desc: "~25 pp/wk" },
  { value: "fast", label: "fast", desc: "~50 pp/wk" },
] as const;

const COMMITMENTS = [
  { value: "casual", label: "casual", desc: "show up when I can" },
  { value: "serious", label: "serious", desc: "I want to finish this" },
] as const;

export default function FindPartner() {
  const [, setLocation] = useLocation();
  const [textTitle, setTextTitle] = useState("");
  const [pace, setPace] = useState<"slow" | "medium" | "fast">("medium");
  const [commitment, setCommitment] = useState<"casual" | "serious">("serious");
  const [scheduleWindows, setSchedule] = useState("");
  const [language, setLanguage] = useState("English");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", "/api/requests", {
        textTitle,
        pace,
        commitment,
        scheduleWindows,
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

  return (
    <PageShell narrow>
      <div className="pt-4">
        <span className="smallcaps">find a partner</span>
        <h1 className="font-serif text-xl mt-1 mb-2">What do you want to read?</h1>
        <p className="text-muted-foreground italic">
          Examples: "Nietzsche — Genealogy of Morals", "The Brothers Karamazov", "anything in
          moral philosophy", "Talmud, Berakhot."
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
            <input
              data-testid="input-schedule"
              value={scheduleWindows}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g. Weekday evenings, GMT-7"
              className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            />
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

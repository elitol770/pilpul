import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { findText } from "@/lib/texts";
import { useAuth } from "@/lib/auth";

type RoomData = {
  pairing: {
    id: string;
    textTitle: string;
    pace: string | null;
    notebookContent: string;
    notebookUpdatedAt: string | null;
    status: string;
  };
  partner: { firstName: string | null; city: string | null } | null;
};

export default function SessionRoom() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const { data, isLoading } = useQuery<RoomData>({
    queryKey: ["/api/pairings", id],
  });

  const [tab, setTab] = useState<"text" | "notebook">("text");
  const [aiOpen, setAiOpen] = useState(false);

  if (isLoading || !data?.pairing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground italic">opening the room…</p>
      </div>
    );
  }

  const pairing = data.pairing;
  const partner = data.partner;
  const text = findText(pairing.textTitle);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="px-6 py-3 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <Link
            href="/"
            className="font-serif italic text-base shrink-0"
            data-testid="link-home-from-room"
          >
            Chavruta
          </Link>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <p className="font-serif italic truncate">
            <span className="text-foreground">{text.title}</span>
            {partner?.firstName ? (
              <span className="text-muted-foreground"> with {partner.firstName}</span>
            ) : null}
          </p>
        </div>
        <EndButton pairingId={pairing.id} />
      </header>

      {/* Mobile tabs */}
      <div className="md:hidden border-b border-border px-6">
        <div className="flex gap-6 text-sm">
          <button
            onClick={() => setTab("text")}
            data-testid="tab-text"
            className={
              "py-3 -mb-px border-b-2 " +
              (tab === "text" ? "border-foreground" : "border-transparent text-muted-foreground")
            }
          >
            text
          </button>
          <button
            onClick={() => setTab("notebook")}
            data-testid="tab-notebook"
            className={
              "py-3 -mb-px border-b-2 " +
              (tab === "notebook"
                ? "border-foreground"
                : "border-transparent text-muted-foreground")
            }
          >
            notebook
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Text panel */}
        <section
          className={
            "md:flex-1 md:border-r border-border md:overflow-y-auto " +
            (tab === "text" ? "block" : "hidden md:block")
          }
        >
          <div className="max-w-prose mx-auto px-6 py-8">
            <span className="smallcaps">{text.source}</span>
            <h2 className="font-serif italic text-xl mt-1">{text.title}</h2>
            {text.author && (
              <p className="text-muted-foreground text-sm mt-1">{text.author}</p>
            )}
            <div className="rule mt-5 mb-6" />
            {text.passages.map((p, i) => (
              <article key={i} className="mb-10">
                <span className="smallcaps">{p.label}</span>
                <div
                  className="font-serif text-[1.0625rem] leading-[1.75] mt-3 space-y-4 prose-paper"
                  dangerouslySetInnerHTML={{ __html: p.html }}
                />
              </article>
            ))}
            <p className="text-xs text-muted-foreground italic mt-12">
              In production, the full text streams in from Sefaria, Project Gutenberg, an
              uploaded EPUB, or a URL rendered in reader-mode. This is a curated demo passage.
            </p>
          </div>
        </section>

        {/* Notebook + Jitsi + AI */}
        <section
          className={
            "md:flex-1 flex flex-col md:overflow-hidden " +
            (tab === "notebook" ? "block" : "hidden md:flex")
          }
        >
          <div className="flex-1 flex flex-col min-h-0">
            <Notebook pairingId={pairing.id} userId={user?.id ?? ""} partnerName={partner?.firstName ?? null} />
            {aiOpen && <AiSeat onClose={() => setAiOpen(false)} />}
          </div>

          <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3 bg-card">
            <div className="flex items-center gap-3 text-xs">
              <button
                data-testid="button-toggle-ai"
                onClick={() => setAiOpen((v) => !v)}
                className="px-3 py-1.5 border border-border rounded-sm hover-elevate"
              >
                {aiOpen ? "close ai" : "summon ai"}
              </button>
              {!aiOpen && (
                <span className="text-muted-foreground italic">
                  AI is silent unless invoked.
                </span>
              )}
            </div>
            <SessionTimer />
          </div>

          <JitsiStrip pairingId={pairing.id} />
        </section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function Notebook({
  pairingId,
  userId,
  partnerName,
}: {
  pairingId: string;
  userId: string;
  partnerName: string | null;
}) {
  const [content, setContent] = useState<string>("");
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [partnerActive, setPartnerActive] = useState(false);
  const lastTypedRef = useRef<number>(0);
  const lastPushedRef = useRef<string>("");
  const skipNextSyncRef = useRef(false);

  // Fetch initial content
  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", `/api/pairings/${pairingId}/notebook`).then(async (r) => {
      const j = await r.json();
      if (!cancelled) {
        setContent(j.content || "");
        setServerUpdatedAt(j.updatedAt);
        lastPushedRef.current = j.content || "";
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pairingId]);

  // Poll for partner updates every 2s
  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const r = await apiRequest("GET", `/api/pairings/${pairingId}/notebook`);
        const j = await r.json();
        if (j.updatedAt && j.updatedAt !== serverUpdatedAt) {
          setServerUpdatedAt(j.updatedAt);
          // Avoid clobbering active typing within last 1.5s
          const sinceTyped = Date.now() - lastTypedRef.current;
          if (sinceTyped > 1500 && j.content !== content) {
            skipNextSyncRef.current = true;
            setContent(j.content);
            lastPushedRef.current = j.content;
            // Show "partner just edited" hint briefly
            setPartnerActive(true);
            setTimeout(() => setPartnerActive(false), 2500);
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(i);
  }, [pairingId, serverUpdatedAt, content]);

  // Push local edits with a debounce
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (content === lastPushedRef.current) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiRequest("PUT", `/api/pairings/${pairingId}/notebook`, {
          content,
        });
        const j = await r.json();
        lastPushedRef.current = content;
        setServerUpdatedAt(j.updatedAt);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [content, pairingId]);

  const placeholder = useMemo(
    () =>
      "Write together. Highlight a passage in the text and bring it here as a quote. Mark questions you want the AI to step in on later.",
    []
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-4 pb-2 flex items-center justify-between text-xs">
        <span className="smallcaps">shared notebook</span>
        {partnerActive && partnerName && (
          <span className="text-primary italic" data-testid="text-partner-active">
            <span className="live-dot" />
            {partnerName} is here
          </span>
        )}
      </div>
      <textarea
        data-testid="textarea-notebook"
        value={content}
        onChange={(e) => {
          lastTypedRef.current = Date.now();
          setContent(e.target.value);
        }}
        placeholder={placeholder}
        className="flex-1 w-full bg-card border-y border-border px-6 py-4 outline-none resize-none font-serif text-[1.0625rem] leading-[1.75]"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

function AiSeat({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"explainer" | "devil" | "source">("explainer");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>("");

  function ask() {
    setBusy(true);
    setResponse(null);
    // The real product calls Anthropic directly with the user's key. For the
    // prototype we simulate the AI so the UX is testable without a key.
    setTimeout(() => {
      const sims: Record<string, string> = {
        explainer:
          "By 'slave morality' Nietzsche means a value system born of ressentiment — the powerless reframe their lack of power as virtue, and the strong's vitality as evil. Compare with First Essay §10.",
        devil:
          "Steel-man the opposite reading: perhaps Nietzsche is not approving noble morality but observing it. The text's irony cuts both ways — and Yael's reading underweights how often Nietzsche distances himself from his own enthusiasms.",
        source:
          "The word 'ressentiment' appears 14 times across the Genealogy. Densest cluster: First Essay §10–11. See also Beyond Good and Evil §260 for an earlier sketch of the same opposition.",
      };
      setResponse(sims[mode]);
      setCostUsd(0.003);
      setBusy(false);
    }, 700);
  }

  return (
    <div className="border-t border-border bg-card">
      <div className="px-6 py-3 flex items-center justify-between">
        <span className="smallcaps">ai third seat</span>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="button-close-ai"
        >
          close
        </button>
      </div>

      <div className="px-6 pb-3 flex flex-wrap gap-2 text-xs">
        {(["explainer", "devil", "source"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            data-testid={`button-mode-${m}`}
            className={
              "px-2.5 py-1 border rounded-sm " +
              (mode === m ? "border-foreground" : "border-border text-muted-foreground")
            }
          >
            {m === "devil" ? "devil's advocate" : m === "source" ? "source finder" : m}
          </button>
        ))}
      </div>

      <div className="px-6 pb-4">
        {!apiKey && (
          <div className="text-xs text-muted-foreground italic mb-2">
            Bring your own Anthropic API key. Stored only in this browser session.{" "}
            <input
              type="password"
              placeholder="sk-ant-… (optional, simulation runs without)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="input-api-key"
              className="ml-1 bg-background border border-border rounded-sm px-2 py-1 w-56 outline-none font-mono text-[10px]"
            />
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prompt && ask()}
            placeholder={
              mode === "explainer"
                ? "What does Nietzsche mean by 'slave morality' here?"
                : mode === "devil"
                ? "Argue against my reading."
                : "Where else in the text does this word appear?"
            }
            data-testid="input-ai-prompt"
            className="flex-1 bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
          />
          <button
            onClick={ask}
            disabled={busy || !prompt}
            data-testid="button-ask-ai"
            className="px-4 py-2 border border-border bg-background hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm"
          >
            {busy ? "thinking…" : "ask"}
          </button>
        </div>
        {response && (
          <div className="mt-3" data-testid="text-ai-response">
            <p className="font-serif italic text-[0.95rem] leading-relaxed">{response}</p>
            {costUsd !== null && (
              <p className="text-[10px] text-muted-foreground mt-2 tabular">
                ${costUsd.toFixed(3)} used.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function SessionTimer() {
  const start = useRef<number>(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const seconds = Math.floor((now - start.current) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className="tabular text-xs text-muted-foreground" data-testid="text-timer">
      {m.toString().padStart(2, "0")}:{s.toString().padStart(2, "0")}
    </span>
  );
}

// -----------------------------------------------------------------------------

function JitsiStrip({ pairingId }: { pairingId: string }) {
  const [open, setOpen] = useState(false);
  const room = `chavruta-${pairingId}`;
  return (
    <div className="border-t border-border bg-background">
      <div className="px-6 py-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground italic">
          Audio room: {room}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          data-testid="button-toggle-jitsi"
          className="px-3 py-1 border border-border rounded-sm hover-elevate"
        >
          {open ? "close audio" : "open audio"}
        </button>
      </div>
      {open && (
        <iframe
          title="Audio room"
          src={`https://meet.jit.si/${encodeURIComponent(room)}#config.startWithVideoMuted=true&config.prejoinPageEnabled=false`}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="w-full"
          style={{ height: 280, border: "none" }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function EndButton({ pairingId }: { pairingId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function end(status: "completed" | "dissolved") {
    setBusy(true);
    try {
      await apiRequest("POST", `/api/pairings/${pairingId}/end`, { status });
      window.location.hash = "#/";
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        data-testid="button-end"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        end session
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        onClick={() => end("completed")}
        disabled={busy}
        data-testid="button-end-completed"
        className="px-3 py-1 border border-border rounded-sm hover-elevate"
      >
        finished the book
      </button>
      <button
        onClick={() => end("dissolved")}
        disabled={busy}
        data-testid="button-end-dissolved"
        className="px-3 py-1 border border-border rounded-sm hover-elevate"
      >
        end pairing
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-muted-foreground"
        data-testid="button-end-cancel"
      >
        cancel
      </button>
    </div>
  );
}

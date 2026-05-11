import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Mic, Video, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { findText } from "@/lib/texts";
import { useAuth } from "@/lib/auth";
import {
  askThirdSeat,
  CLAUDE_MODEL,
  OPENAI_MODEL,
  type AiMode,
  type AiProvider,
  type ThirdSeatAnswer,
} from "@/lib/ai";
import type { ReadingText } from "@shared/schema";

type RoomData = {
  pairing: {
    id: string;
    textTitle: string;
    textSourceId: string | null;
    pace: string | null;
    notebookContent: string;
    notebookUpdatedAt: string | null;
    status: string;
  };
  partner: { firstName: string | null; city: string | null } | null;
  readingText: (ReadingText & { signedUrl: string }) | null;
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
  const [notebookForAi, setNotebookForAi] = useState("");

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
  const title = data.readingText?.title ?? text.title;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="px-6 py-3 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <Link
            href="/"
            className="font-serif italic text-base shrink-0"
            data-testid="link-home-from-room"
          >
            Pilpul
          </Link>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <p className="font-serif italic truncate">
            <span className="text-foreground">{title}</span>
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

      <div className="flex-1 flex flex-col md:flex-row min-h-0 md:overflow-hidden">
        {/* Text panel */}
        <section
          className={
            "md:flex-1 min-h-0 md:border-r border-border md:overflow-y-auto " +
            (tab === "text" ? "block" : "hidden md:block")
          }
        >
          {data.readingText?.signedUrl ? (
            <PdfReader text={data.readingText} />
          ) : (
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
                No PDF is attached to this pairing yet, so the room is showing a demo passage.
              </p>
            </div>
          )}
        </section>

        {/* Notebook + Jitsi + AI */}
        <section
          className={
            "md:flex-1 min-h-0 flex flex-col md:overflow-hidden " +
            (tab === "notebook" ? "block" : "hidden md:flex")
          }
        >
          <div className="flex-1 flex flex-col min-h-0">
            <Notebook
              pairingId={pairing.id}
              userId={user?.id ?? ""}
              partnerName={partner?.firstName ?? null}
              onContentForAi={setNotebookForAi}
            />
            {aiOpen && (
              <AiSeat
                onClose={() => setAiOpen(false)}
                textTitle={title}
                notebookContent={notebookForAi}
              />
            )}
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

function PdfReader({ text }: { text: ReadingText & { signedUrl: string } }) {
  return (
    <div className="h-full min-h-[calc(100vh-106px)] flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <span className="smallcaps">pdf</span>
        <h2 className="font-serif italic text-xl mt-1">{text.title}</h2>
        {text.sourceUrl && (
          <p className="text-xs text-muted-foreground truncate mt-1">{text.sourceUrl}</p>
        )}
      </div>
      <div className="flex-1 min-h-[70vh] px-6 pb-6">
        <iframe
          title={text.title}
          src={`${text.signedUrl}#view=FitH`}
          className="w-full h-full min-h-[70vh] border border-border rounded-sm bg-card"
          data-testid="iframe-pdf-reader"
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function mergeNotebookContent(base: string, server: string, local: string): string {
  if (server === local) return server;
  if (server.includes(local)) return server;
  if (local.includes(server)) return local;

  if (base && server.startsWith(base) && local.startsWith(base)) {
    const serverAdded = server.slice(base.length).trim();
    const localAdded = local.slice(base.length).trim();
    return [base.trimEnd(), serverAdded, localAdded].filter(Boolean).join("\n\n");
  }

  return `${server.trimEnd()}\n\n--- local edit from this browser ---\n${local.trimStart()}`;
}

function Notebook({
  pairingId,
  userId,
  partnerName,
  onContentForAi,
}: {
  pairingId: string;
  userId: string;
  partnerName: string | null;
  onContentForAi: (content: string) => void;
}) {
  const [content, setContent] = useState<string>("");
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [partnerActive, setPartnerActive] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
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
        onContentForAi(j.content || "");
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
          if (j.content === content) {
            setServerUpdatedAt(j.updatedAt);
            lastPushedRef.current = j.content;
            return;
          }

          // Avoid clobbering active typing within last 1.5s
          const sinceTyped = Date.now() - lastTypedRef.current;
          if (sinceTyped > 1500 && j.content !== content) {
            skipNextSyncRef.current = true;
            setContent(j.content);
            onContentForAi(j.content);
            setServerUpdatedAt(j.updatedAt);
            lastPushedRef.current = j.content;
            // Show "partner just edited" hint briefly
            setPartnerActive(true);
            setTimeout(() => setPartnerActive(false), 2500);
          } else {
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
      const localContent = content;
      try {
        const r = await apiRequest("PUT", `/api/pairings/${pairingId}/notebook`, {
          content: localContent,
          baseUpdatedAt: serverUpdatedAt,
        });
        const j = await r.json();
        lastPushedRef.current = j.content ?? localContent;
        setServerUpdatedAt(j.updatedAt);
      } catch (e: any) {
        if (e.status === 409 && typeof e.body?.content === "string") {
          const merged = mergeNotebookContent(lastPushedRef.current, e.body.content, localContent);
          lastPushedRef.current = e.body.content;
          setServerUpdatedAt(e.body.updatedAt ?? null);
          setSyncWarning("Your partner edited at the same time. Pilpul kept both versions.");
          setContent(merged);
          onContentForAi(merged);
          setTimeout(() => setSyncWarning(null), 4500);
        }
      }
    }, 650);
    return () => clearTimeout(t);
  }, [content, pairingId, serverUpdatedAt]);

  const placeholder = useMemo(
    () =>
      "Write together. Paste quotes from the text, mark live questions, and keep the thread of what you decided.",
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
      {syncWarning && (
        <p className="px-6 pb-2 text-xs italic text-muted-foreground" data-testid="text-notebook-sync-warning">
          {syncWarning}
        </p>
      )}
      <textarea
        data-testid="textarea-notebook"
        value={content}
        onChange={(e) => {
          lastTypedRef.current = Date.now();
          setSyncWarning(null);
          setContent(e.target.value);
          onContentForAi(e.target.value);
        }}
        placeholder={placeholder}
        className="flex-1 w-full bg-card border-y border-border px-6 py-4 outline-none resize-none font-serif text-[1.0625rem] leading-[1.75]"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

const AI_PROVIDER_STORAGE = "pilpul_ai_provider";
const AI_KEYS_STORAGE = {
  anthropic: "pilpul_anthropic_key",
  openai: "pilpul_openai_key",
  compatible: "pilpul_compatible_key",
} satisfies Record<AiProvider, string>;
const AI_COMPATIBLE_BASE_STORAGE = "pilpul_compatible_base_url";
const AI_COMPATIBLE_MODEL_STORAGE = "pilpul_compatible_model";

const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  compatible: "compatible",
};

function lastNotebookExcerpt(content: string): string {
  return content.trim().slice(-4000);
}

function storedValue(key: string, fallback = ""): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function defaultModel(provider: AiProvider): string {
  if (provider === "openai") return OPENAI_MODEL;
  if (provider === "anthropic") return CLAUDE_MODEL;
  return storedValue(AI_COMPATIBLE_MODEL_STORAGE, "");
}

function AiSeat({
  onClose,
  textTitle,
  notebookContent,
}: {
  onClose: () => void;
  textTitle: string;
  notebookContent: string;
}) {
  const [mode, setMode] = useState<AiMode>("explainer");
  const [provider, setProvider] = useState<AiProvider>(() => {
    const stored = storedValue(AI_PROVIDER_STORAGE);
    return stored === "openai" || stored === "compatible" ? stored : "anthropic";
  });
  const [apiKey, setApiKey] = useState(() => {
    const storedProvider = storedValue(AI_PROVIDER_STORAGE);
    const initialProvider: AiProvider = storedProvider === "openai" || storedProvider === "compatible" ? storedProvider : "anthropic";
    return storedValue(AI_KEYS_STORAGE[initialProvider]);
  });
  const [model, setModel] = useState(() => defaultModel(provider));
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState(() =>
    storedValue(AI_COMPATIBLE_BASE_STORAGE, "https://openrouter.ai/api/v1")
  );
  const [rememberKey, setRememberKey] = useState(() => Boolean(apiKey));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ThirdSeatAnswer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_PROVIDER_STORAGE, provider);
      if (rememberKey && apiKey.trim()) window.localStorage.setItem(AI_KEYS_STORAGE[provider], apiKey.trim());
      else window.localStorage.removeItem(AI_KEYS_STORAGE[provider]);
      if (provider === "compatible") {
        window.localStorage.setItem(AI_COMPATIBLE_BASE_STORAGE, compatibleBaseUrl.trim());
        window.localStorage.setItem(AI_COMPATIBLE_MODEL_STORAGE, model.trim());
      }
    } catch {}
  }, [apiKey, compatibleBaseUrl, model, provider, rememberKey]);

  function chooseProvider(next: AiProvider) {
    setProvider(next);
    setApiKey(storedValue(AI_KEYS_STORAGE[next]));
    setModel(defaultModel(next));
    setErr(null);
    setResponse(null);
  }

  async function ask() {
    const key = apiKey.trim();
    const question = prompt.trim();
    if (!key || !question) return;
    setBusy(true);
    setResponse(null);
    setErr(null);
    try {
      const answer = await askThirdSeat({
        provider,
        apiKey: key,
        model,
        baseUrl: provider === "compatible" ? compatibleBaseUrl : undefined,
        mode,
        prompt: question,
        textTitle,
        notebookExcerpt: lastNotebookExcerpt(notebookContent),
      });
      setResponse(answer);
    } catch (e: any) {
      setErr(e.message || "Claude could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-card max-h-[45vh] overflow-y-auto">
      <div className="px-6 py-3 flex items-center justify-between">
        <div>
          <span className="smallcaps">ai third seat</span>
          <p className="text-[11px] text-muted-foreground tabular mt-1">{AI_PROVIDER_LABELS[provider]} · {model || "choose model"}</p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="button-close-ai"
        >
          close
        </button>
      </div>

      <div className="px-6 pb-3 grid gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {(["anthropic", "openai", "compatible"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => chooseProvider(item)}
              data-testid={`button-ai-provider-${item}`}
              className={
                "px-2.5 py-1 border rounded-sm " +
                (provider === item ? "border-foreground" : "border-border text-muted-foreground")
              }
            >
              {AI_PROVIDER_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
          <div>
            <label className="smallcaps block mb-2" htmlFor="ai-model">
              model
            </label>
            <input
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "compatible" ? "provider-model-name" : defaultModel(provider)}
              data-testid="input-ai-model"
              className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
            />
          </div>
          <div>
            <label className="smallcaps block mb-2" htmlFor="ai-key">
              api key
            </label>
            <input
              id="ai-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
              data-testid="input-ai-key"
              className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
            />
          </div>
        </div>
        {provider === "compatible" && (
          <div>
            <label className="smallcaps block mb-2" htmlFor="compatible-base-url">
              base url
            </label>
            <input
              id="compatible-base-url"
              value={compatibleBaseUrl}
              onChange={(e) => setCompatibleBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              data-testid="input-compatible-base-url"
              className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => setRememberKey(e.target.checked)}
              className="accent-primary"
              data-testid="checkbox-remember-ai-key"
            />
            remember on this device
          </label>
          {apiKey && (
            <button
              type="button"
              onClick={() => {
                setApiKey("");
                setRememberKey(false);
              }}
              className="underline underline-offset-4"
              data-testid="button-forget-ai-key"
            >
              forget key
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          Your key is sent from this browser to {AI_PROVIDER_LABELS[provider]} for this request. Pilpul does not store it.
        </p>
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
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prompt.trim() && apiKey.trim() && ask()}
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
            disabled={busy || !prompt.trim() || !apiKey.trim()}
            data-testid="button-ask-ai"
            className="px-4 py-2 border border-border bg-background hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm"
          >
            {busy ? "thinking…" : "ask"}
          </button>
        </div>
        {err && (
          <p className="mt-3 text-sm text-destructive" data-testid="text-ai-error">
            {err}
          </p>
        )}
        {response && (
          <div className="mt-3" data-testid="text-ai-response">
            <p className="font-serif italic text-[0.95rem] leading-relaxed whitespace-pre-wrap">
              {response.text}
            </p>
            <p className="text-[10px] text-muted-foreground mt-2 tabular">
              {response.estimatedCostUsd === null
                ? "provider-billed"
                : `~$${response.estimatedCostUsd.toFixed(4)} used`}{" "}
              · {response.inputTokens} in · {response.outputTokens} out · {response.providerLabel}
            </p>
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
  const [mode, setMode] = useState<"voice" | "video" | null>(null);
  const room = `pilpul-${pairingId}`;
  const roomUrl = `https://meet.jit.si/${encodeURIComponent(room)}`;
  const iframeUrl =
    mode === "voice"
      ? `${roomUrl}#config.startAudioOnly=true&config.startWithVideoMuted=true&config.prejoinPageEnabled=false`
      : `${roomUrl}#config.startWithVideoMuted=false&config.prejoinPageEnabled=false`;

  return (
    <div className="border-t border-border bg-background">
      <div className="px-6 py-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground italic truncate">room: {room}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("voice")}
            data-testid="button-open-voice"
            className={
              "h-8 w-8 inline-flex items-center justify-center border rounded-sm hover-elevate " +
              (mode === "voice" ? "border-foreground" : "border-border")
            }
            aria-label="Open voice"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMode("video")}
            data-testid="button-open-video"
            className={
              "h-8 w-8 inline-flex items-center justify-center border rounded-sm hover-elevate " +
              (mode === "video" ? "border-foreground" : "border-border")
            }
            aria-label="Open video"
          >
            <Video className="h-4 w-4" />
          </button>
          <a
            href={roomUrl}
            target="_blank"
            rel="noreferrer"
            className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm hover-elevate"
            aria-label="Open call in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          {mode && (
            <button
              onClick={() => setMode(null)}
              data-testid="button-close-call"
              className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm hover-elevate"
              aria-label="Close call"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {mode && (
        <iframe
          title="Study room call"
          src={iframeUrl}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="w-full"
          style={{ height: 360, border: "none" }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

const REPORT_REASONS = [
  "Did not show up",
  "Harassment or abuse",
  "Spam or bad-faith use",
  "Unsafe behavior",
  "Other",
];

function EndButton({ pairingId }: { pairingId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function end(status: "completed" | "dissolved") {
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", `/api/pairings/${pairingId}/end`, { status });
      window.location.hash = "#/";
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not end pairing");
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", `/api/pairings/${pairingId}/report`, {
        reason,
        details: details.trim() || null,
      });
      window.location.hash = "#/";
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not submit report");
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

  if (reporting) {
    return (
      <div className="fixed right-4 top-14 z-10 w-[min(92vw,360px)] border border-border bg-card p-4 text-xs">
        <span className="smallcaps">report partner</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-3 w-full bg-background border border-border rounded-sm px-2 py-2 outline-none"
          data-testid="select-report-reason"
        >
          {REPORT_REASONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional details"
          className="mt-3 w-full h-24 bg-background border border-border rounded-sm px-2 py-2 outline-none resize-none"
          data-testid="textarea-report-details"
        />
        {err && <p className="text-destructive mt-2">{err}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={() => setReporting(false)}
            disabled={busy}
            className="text-muted-foreground"
            data-testid="button-report-back"
          >
            back
          </button>
          <button
            onClick={report}
            disabled={busy}
            data-testid="button-submit-report"
            className="px-3 py-1 border border-border rounded-sm hover-elevate"
          >
            {busy ? "sending…" : "report and leave"}
          </button>
        </div>
      </div>
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
        onClick={() => setReporting(true)}
        disabled={busy}
        data-testid="button-report"
        className="px-3 py-1 border border-border rounded-sm hover-elevate"
      >
        report
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-muted-foreground"
        data-testid="button-end-cancel"
      >
        cancel
      </button>
      {err && <span className="text-destructive">{err}</span>}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Mic, Minus, Plus, Video, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
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

type PdfStudyContext = {
  pageNumber: number;
  selectedText: string | null;
  pageText: string | null;
};

type PdfJsModule = typeof import("pdfjs-dist");

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
  const [pdfContext, setPdfContext] = useState<PdfStudyContext | null>(null);
  const [aiDraftPrompt, setAiDraftPrompt] = useState("");

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
            <PdfReader
              text={data.readingText}
              onContextChange={setPdfContext}
              onAskSelection={(context) => {
                setPdfContext(context);
                setAiDraftPrompt(
                  context.selectedText
                    ? `Help us understand this passage from page ${context.pageNumber}:\n\n${context.selectedText}`
                    : `Help us understand page ${context.pageNumber}.`,
                );
                setAiOpen(true);
                setTab("notebook");
              }}
            />
          ) : (
            <div className="max-w-prose mx-auto px-6 py-8">
              <span className="smallcaps">{text.source}</span>
              <h2 className="font-serif italic text-xl mt-1">{text.title}</h2>
              {text.author && <p className="text-muted-foreground text-sm mt-1">{text.author}</p>}
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
                pdfUrl={data.readingText?.signedUrl ?? null}
                pdfContext={pdfContext}
                draftPrompt={aiDraftPrompt}
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
                <span className="text-muted-foreground italic">AI is silent unless invoked.</span>
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

function textContentToString(content: { items: Array<unknown> }): string {
  return content.items
    .map((item) => {
      const str = (item as { str?: unknown }).str;
      return typeof str === "string" ? str : "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectionInside(node: HTMLElement | null): string {
  if (!node) return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if ((anchor && !node.contains(anchor)) || (focus && !node.contains(focus))) return "";
  return selection.toString().replace(/\s+/g, " ").trim();
}

function PdfReader({
  text,
  onContextChange,
  onAskSelection,
}: {
  text: ReadingText & { signedUrl: string };
  onContextChange: (context: PdfStudyContext) => void;
  onAskSelection: (context: PdfStudyContext) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJsModule | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.15);
  const [pageText, setPageText] = useState("");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJsModule["getDocument"]> | null = null;
    setLoading(true);
    setErr(null);
    setDoc(null);
    setPageNumber(1);
    setPageInput("1");

    async function loadPdf() {
      try {
        const loadedPdfjs = await import("pdfjs-dist");
        loadedPdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        if (cancelled) return;

        setPdfjs(loadedPdfjs);
        task = loadedPdfjs.getDocument({ url: text.signedUrl });
        const loaded = await task.promise;
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setDoc(loaded);
      } catch (error: any) {
        if (!cancelled) setErr(error.message || "Could not open PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [text.signedUrl]);

  useEffect(() => {
    if (!doc || !pdfjs) return;
    const pdfjsLib = pdfjs;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      const textLayerNode = textLayerRef.current;
      if (!canvas || !textLayerNode || !doc) return;

      setRendering(true);
      setErr(null);
      setSelectedText(null);

      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not available");

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        textLayerNode.style.width = canvas.style.width;
        textLayerNode.style.height = canvas.style.height;
        textLayerNode.style.setProperty("--scale-factor", String(viewport.scale));
        textLayerNode.replaceChildren();

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;

        const content = await page.getTextContent();
        if (cancelled) return;

        const nextPageText = textContentToString(content);
        setPageText(nextPageText);
        onContextChange({ pageNumber, selectedText: null, pageText: nextPageText });

        textLayer = new pdfjsLib.TextLayer({
          textContentSource: content,
          container: textLayerNode,
          viewport,
        });
        await textLayer.render();
      } catch (error: any) {
        if (!cancelled && error?.name !== "RenderingCancelledException") {
          setErr(error.message || "Could not render PDF page");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, onContextChange, pageNumber, pdfjs, scale]);

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  function clampPage(value: number): number {
    if (!doc) return 1;
    return Math.min(Math.max(value, 1), doc.numPages);
  }

  function commitPageInput() {
    const next = Number(pageInput);
    if (Number.isFinite(next)) setPageNumber(clampPage(Math.round(next)));
    else setPageInput(String(pageNumber));
  }

  function captureSelection() {
    const next = selectionInside(textLayerRef.current);
    const normalized = next ? next.slice(0, 4000) : null;
    setSelectedText(normalized);
    onContextChange({ pageNumber, selectedText: normalized, pageText });
  }

  const currentContext = { pageNumber, selectedText, pageText };

  return (
    <div className="h-full min-h-[calc(100vh-106px)] flex flex-col">
      <div className="px-6 pt-5 pb-4 border-b border-border bg-background">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <span className="smallcaps">pdf</span>
            <h2 className="font-serif italic text-xl mt-1 truncate">{text.title}</h2>
            {text.sourceUrl && (
              <p className="text-xs text-muted-foreground truncate mt-1">{text.sourceUrl}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageNumber((current) => clampPage(current - 1))}
                disabled={!doc || pageNumber <= 1}
                aria-label="Previous page"
                className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm bg-card hover-elevate disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={commitPageInput}
                onKeyDown={(event) => event.key === "Enter" && commitPageInput()}
                inputMode="numeric"
                className="h-8 w-14 bg-card border border-border rounded-sm px-2 text-center text-sm tabular outline-none focus:border-primary"
                data-testid="input-pdf-page"
              />
              <span className="text-xs text-muted-foreground tabular">
                / {doc?.numPages ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((current) => clampPage(current + 1))}
                disabled={!doc || pageNumber >= doc.numPages}
                aria-label="Next page"
                className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm bg-card hover-elevate disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setScale((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))
                }
                aria-label="Zoom out"
                className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm bg-card hover-elevate"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-xs text-muted-foreground tabular">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setScale((current) => Math.min(2.2, Number((current + 0.1).toFixed(2))))
                }
                aria-label="Zoom in"
                className="h-8 w-8 inline-flex items-center justify-center border border-border rounded-sm bg-card hover-elevate"
              >
                <Plus className="h-4 w-4" />
              </button>
              {selectedText && (
                <button
                  type="button"
                  onClick={() => onAskSelection(currentContext)}
                  data-testid="button-ask-ai-about-selection"
                  className="ml-1 px-3 py-1.5 border border-border rounded-sm bg-card hover-elevate font-serif italic text-sm"
                >
                  ask ai
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-6"
        onMouseUp={captureSelection}
        onTouchEnd={() => setTimeout(captureSelection, 0)}
      >
        {loading ? (
          <p className="text-muted-foreground italic">opening PDF...</p>
        ) : err ? (
          <p className="text-destructive text-sm">{err}</p>
        ) : (
          <div
            ref={pageWrapRef}
            className="relative mx-auto w-fit bg-white text-black border border-border"
            data-testid="pdf-page"
          >
            <canvas ref={canvasRef} className="block" />
            <div ref={textLayerRef} className="textLayer absolute inset-0" />
            {rendering && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-muted-foreground italic">
                rendering...
              </div>
            )}
          </div>
        )}
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
    [],
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
        <p
          className="px-6 pb-2 text-xs italic text-muted-foreground"
          data-testid="text-notebook-sync-warning"
        >
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

function sessionValue(key: string, fallback = ""): string {
  try {
    return window.sessionStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function setSessionValue(key: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {}
}

function setLocalValue(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {}
}

function storedProvider(): AiProvider {
  const stored = storedValue(AI_PROVIDER_STORAGE);
  return stored === "openai" || stored === "compatible" ? stored : "anthropic";
}

function storedApiKey(provider: AiProvider): string {
  const key = AI_KEYS_STORAGE[provider];
  return sessionValue(key) || storedValue(key);
}

function hasRememberedApiKey(provider: AiProvider): boolean {
  return Boolean(storedValue(AI_KEYS_STORAGE[provider]));
}

function persistApiKey(provider: AiProvider, apiKey: string, remember: boolean) {
  const key = AI_KEYS_STORAGE[provider];
  const value = apiKey.trim();
  setSessionValue(key, value);
  setLocalValue(key, remember ? value : "");
}

function defaultModel(provider: AiProvider): string {
  if (provider === "openai") return OPENAI_MODEL;
  if (provider === "anthropic") return CLAUDE_MODEL;
  return storedValue(AI_COMPATIBLE_MODEL_STORAGE, "");
}

function AiSeat({
  onClose,
  textTitle,
  pdfUrl,
  pdfContext,
  draftPrompt,
  notebookContent,
}: {
  onClose: () => void;
  textTitle: string;
  pdfUrl: string | null;
  pdfContext: PdfStudyContext | null;
  draftPrompt: string;
  notebookContent: string;
}) {
  const [mode, setMode] = useState<AiMode>("explainer");
  const [provider, setProvider] = useState<AiProvider>(() => storedProvider());
  const [apiKey, setApiKey] = useState(() => storedApiKey(storedProvider()));
  const [model, setModel] = useState(() => defaultModel(provider));
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState(() =>
    storedValue(AI_COMPATIBLE_BASE_STORAGE, "https://openrouter.ai/api/v1"),
  );
  const [rememberKey, setRememberKey] = useState(() => hasRememberedApiKey(storedProvider()));
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<ThirdSeatAnswer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (draftPrompt) setPrompt(draftPrompt);
  }, [draftPrompt]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_PROVIDER_STORAGE, provider);
      persistApiKey(provider, apiKey, rememberKey);
      if (provider === "compatible") {
        window.localStorage.setItem(AI_COMPATIBLE_BASE_STORAGE, compatibleBaseUrl.trim());
        window.localStorage.setItem(AI_COMPATIBLE_MODEL_STORAGE, model.trim());
      }
    } catch {}
  }, [apiKey, compatibleBaseUrl, model, provider, rememberKey]);

  function chooseProvider(next: AiProvider) {
    setProvider(next);
    setApiKey(storedApiKey(next));
    setRememberKey(hasRememberedApiKey(next));
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
        pdfUrl: provider === "compatible" ? null : pdfUrl,
        pdfContext,
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
          <p className="text-[11px] text-muted-foreground tabular mt-1">
            {AI_PROVIDER_LABELS[provider]} · {model || "choose model"}
          </p>
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
              placeholder={
                provider === "compatible" ? "provider-model-name" : defaultModel(provider)
              }
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
                persistApiKey(provider, "", false);
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
          Your key is sent from this browser to {AI_PROVIDER_LABELS[provider]} for this request.
          Pilpul does not store it. Unless remembered, it stays only in this tab session.
          {pdfUrl && provider !== "compatible"
            ? " The attached PDF and current notebook excerpt are included."
            : ""}
          {pdfUrl && provider === "compatible"
            ? " Compatible providers receive the notebook excerpt; PDF support depends on the provider."
            : ""}
          {pdfContext?.pageNumber
            ? ` Current page ${pdfContext.pageNumber}${pdfContext.selectedText ? " and selected passage" : ""} are included.`
            : ""}
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

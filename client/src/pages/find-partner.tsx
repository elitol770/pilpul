import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReadingText } from "@shared/schema";

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
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<"upload" | "fetch" | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const { data: textData } = useQuery<{ texts: ReadingText[] }>({
    queryKey: ["/api/texts"],
  });
  const selectedText = textData?.texts.find((text) => text.id === selectedTextId) ?? null;

  function rememberText(text: ReadingText) {
    queryClient.setQueryData<{ texts: ReadingText[] }>(["/api/texts"], (current) => ({
      texts: [text, ...(current?.texts.filter((item) => item.id !== text.id) ?? [])],
    }));
    setSelectedTextId(text.id);
    setTextTitle((current) => current || text.title);
  }

  async function uploadPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setPdfBusy("upload");
    setPdfErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", textTitle || file.name.replace(/\.pdf$/i, ""));
      const response = await apiRequest("POST", "/api/texts/upload", form);
      const body = (await response.json()) as { text: ReadingText };
      rememberText(body.text);
      await queryClient.invalidateQueries({ queryKey: ["/api/texts"] });
    } catch (e: any) {
      setPdfErr(e.message?.replace(/^\d+:\s*/, "") || "Could not upload PDF");
    } finally {
      setPdfBusy(null);
      input.value = "";
    }
  }

  async function fetchPdf() {
    if (!pdfUrl.trim()) return;

    setPdfBusy("fetch");
    setPdfErr(null);
    try {
      const response = await apiRequest("POST", "/api/texts/fetch", {
        url: pdfUrl.trim(),
        title: textTitle || undefined,
      });
      const body = (await response.json()) as { text: ReadingText };
      rememberText(body.text);
      setPdfUrl("");
      await queryClient.invalidateQueries({ queryKey: ["/api/texts"] });
    } catch (e: any) {
      setPdfErr(e.message?.replace(/^\d+:\s*/, "") || "Could not fetch PDF");
    } finally {
      setPdfBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", "/api/requests", {
        textTitle,
        textSourceId: selectedTextId,
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
            <div className="mt-4 border-y border-border py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="smallcaps block">pdf</span>
                  <p className="text-xs text-muted-foreground italic mt-1">
                    Upload a private copy, or import a page that links to a PDF.
                  </p>
                </div>
                {selectedText && (
                  <button
                    type="button"
                    onClick={() => setSelectedTextId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    remove
                  </button>
                )}
              </div>

              {selectedText && (
                <p className="mt-3 text-sm font-serif italic" data-testid="text-selected-pdf">
                  Using {selectedText.title}
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={uploadPdf}
                  disabled={pdfBusy !== null}
                  data-testid="input-pdf-upload"
                  className="block w-full text-sm file:mr-3 file:rounded-sm file:border file:border-border file:bg-card file:px-3 file:py-2 file:font-serif file:italic file:text-foreground"
                />
                <span className="self-center text-xs text-muted-foreground tabular">max 50 MB</span>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  placeholder="https://example.org/text-or-page"
                  data-testid="input-pdf-url"
                  className="flex-1 min-w-0 bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
                />
                <button
                  type="button"
                  onClick={fetchPdf}
                  disabled={pdfBusy !== null || !pdfUrl.trim()}
                  data-testid="button-fetch-pdf"
                  className="px-3 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm whitespace-nowrap"
                >
                  {pdfBusy === "fetch" ? "fetching…" : "fetch"}
                </button>
              </div>

              {!!textData?.texts.length && (
                <div className="mt-4 space-y-2">
                  <span className="smallcaps block">your PDFs</span>
                  {textData.texts.slice(0, 4).map((text) => (
                    <button
                      type="button"
                      key={text.id}
                      onClick={() => {
                        setSelectedTextId(text.id);
                        setTextTitle((current) => current || text.title);
                      }}
                      data-testid={`button-select-text-${text.id}`}
                      className={
                        "w-full text-left border rounded-sm px-3 py-2 hover-elevate " +
                        (selectedTextId === text.id ? "border-foreground bg-card" : "border-border bg-card")
                      }
                    >
                      <span className="font-serif italic block truncate">{text.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {text.sourceKind === "web_pdf" ? "web PDF" : "uploaded PDF"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {pdfBusy === "upload" && (
                <p className="text-xs text-muted-foreground italic mt-3">uploading PDF…</p>
              )}
              {pdfErr && <p className="text-destructive text-sm mt-3">{pdfErr}</p>}
            </div>
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

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReadingText } from "@shared/schema";

type PdfTextPickerProps = {
  textTitle: string;
  selectedTextId: string | null;
  onSelectedTextIdChange: (id: string | null) => void;
  onTitleSuggestion: (title: string) => void;
  description: string;
  uploadTestId: string;
  urlTestId: string;
  fetchTestId: string;
  selectedTestId?: string;
};

function formatBytes(value: number | null): string {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function sourceLabel(text: ReadingText): string {
  const size = formatBytes(text.fileSize);
  const kind = text.sourceKind === "web_pdf" ? "web PDF" : "uploaded PDF";
  return size ? `${kind} · ${size}` : kind;
}

export function PdfTextPicker({
  textTitle,
  selectedTextId,
  onSelectedTextIdChange,
  onTitleSuggestion,
  description,
  uploadTestId,
  urlTestId,
  fetchTestId,
  selectedTestId,
}: PdfTextPickerProps) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBusy, setPdfBusy] = useState<"upload" | "fetch" | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const { data: textData } = useQuery<{ texts: ReadingText[] }>({
    queryKey: ["/api/texts"],
  });
  const texts = textData?.texts ?? [];
  const selectedText = texts.find((text) => text.id === selectedTextId) ?? null;

  useEffect(() => {
    setPreviewUrl(null);
    setPdfErr(null);
  }, [selectedTextId]);

  function rememberText(text: ReadingText) {
    queryClient.setQueryData<{ texts: ReadingText[] }>(["/api/texts"], (current) => ({
      texts: [text, ...(current?.texts ?? []).filter((item) => item.id !== text.id)],
    }));
    onSelectedTextIdChange(text.id);
    if (!textTitle.trim()) onTitleSuggestion(text.title);
  }

  function selectText(text: ReadingText) {
    onSelectedTextIdChange(text.id);
    if (!textTitle.trim()) onTitleSuggestion(text.title);
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

  async function loadPreview() {
    if (!selectedText) return;
    if (previewUrl) {
      setPreviewUrl(null);
      return;
    }

    setPreviewBusy(true);
    setPdfErr(null);
    try {
      const response = await apiRequest("GET", `/api/texts/${selectedText.id}/url`);
      const body = (await response.json()) as { signedUrl: string };
      setPreviewUrl(body.signedUrl);
    } catch (e: any) {
      setPdfErr(e.message?.replace(/^\d+:\s*/, "") || "Could not preview PDF");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="mt-4 border-y border-border py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="smallcaps block">pdf</span>
          <p className="text-xs text-muted-foreground italic mt-1">{description}</p>
        </div>
        {selectedText && (
          <button
            type="button"
            onClick={() => onSelectedTextIdChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            remove
          </button>
        )}
      </div>

      {selectedText && (
        <div className="mt-3 border border-border bg-card rounded-sm p-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-serif italic truncate" data-testid={selectedTestId}>
                Using {selectedText.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{sourceLabel(selectedText)}</p>
            </div>
            <button
              type="button"
              onClick={loadPreview}
              disabled={previewBusy}
              className="px-3 py-1.5 border border-border bg-background rounded-sm hover-elevate font-serif italic text-sm w-fit"
            >
              {previewBusy ? "preparing..." : previewUrl ? "hide preview" : "preview"}
            </button>
          </div>
          {previewUrl && (
            <iframe
              title={`Preview of ${selectedText.title}`}
              src={previewUrl}
              className="mt-3 h-[420px] w-full border border-border bg-white"
            />
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="file"
          accept="application/pdf"
          onChange={uploadPdf}
          disabled={pdfBusy !== null}
          data-testid={uploadTestId}
          className="block w-full text-sm file:mr-3 file:rounded-sm file:border file:border-border file:bg-card file:px-3 file:py-2 file:font-serif file:italic file:text-foreground"
        />
        <span className="self-center text-xs text-muted-foreground tabular">max 50 MB</span>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={pdfUrl}
          onChange={(e) => setPdfUrl(e.target.value)}
          placeholder="https://example.org/text-or-page"
          data-testid={urlTestId}
          className="flex-1 min-w-0 bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
        />
        <button
          type="button"
          onClick={fetchPdf}
          disabled={pdfBusy !== null || !pdfUrl.trim()}
          data-testid={fetchTestId}
          className="px-3 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm whitespace-nowrap"
        >
          {pdfBusy === "fetch" ? "fetching..." : "fetch"}
        </button>
      </div>

      {!!texts.length && (
        <div className="mt-4 space-y-2">
          <span className="smallcaps block">your PDFs</span>
          {texts.slice(0, 6).map((text) => (
            <button
              type="button"
              key={text.id}
              onClick={() => selectText(text)}
              data-testid={`button-select-text-${text.id}`}
              className={
                "w-full text-left border rounded-sm px-3 py-2 hover-elevate " +
                (selectedTextId === text.id ? "border-foreground bg-card" : "border-border bg-card")
              }
            >
              <span className="font-serif italic block truncate">{text.title}</span>
              <span className="text-xs text-muted-foreground">{sourceLabel(text)}</span>
            </button>
          ))}
        </div>
      )}

      {pdfBusy === "upload" && (
        <p className="text-xs text-muted-foreground italic mt-3">uploading PDF...</p>
      )}
      {pdfErr && <p className="text-destructive text-sm mt-3">{pdfErr}</p>}
    </div>
  );
}

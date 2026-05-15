export const PDF_BUCKET = "reading-texts";
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export class PdfFetchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PdfFetchError";
  }
}

export type FetchedPdf = {
  buffer: ArrayBuffer;
  sourceUrl: string;
  titleFallback: string;
};

export function cleanTitle(value: unknown, fallback: string): string {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || fallback).replace(/\.pdf$/i, "").slice(0, 180);
}

export function titleFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop();
  if (!last) return url.hostname;
  try {
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return last.replace(/[-_]+/g, " ");
  }
}

export function isPdfBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const sig = new Uint8Array(buffer.slice(0, 5));
  return (
    sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46 && sig[4] === 0x2d
  );
}

function looksLikePdfUrl(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith(".pdf");
}

function looksLikePdfResponse(response: Response, url: URL): boolean {
  return (
    (response.headers.get("content-type") ?? "").toLowerCase().includes("pdf") ||
    looksLikePdfUrl(url)
  );
}

function looksLikeHtmlResponse(response: Response): boolean {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("html") || contentType.includes("text/plain");
}

async function readPdfBuffer(response: Response): Promise<ArrayBuffer> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PDF_BYTES) {
    throw new PdfFetchError("PDF must be 50 MB or smaller");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new PdfFetchError("PDF must be 50 MB or smaller");
  }
  if (!isPdfBytes(buffer)) {
    throw new PdfFetchError("That file does not look like a PDF");
  }
  return buffer;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function findPdfLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  const rawUrlPattern = /https?:\/\/[^\s"'<>]+?\.pdf(?:[?#][^\s"'<>]*)?/gi;

  for (const match of Array.from(html.matchAll(hrefPattern))) {
    const raw = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
    if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:")) continue;

    try {
      const url = new URL(raw, base);
      if ((url.protocol === "http:" || url.protocol === "https:") && looksLikePdfUrl(url)) {
        links.add(url.toString());
      }
    } catch {
      // Ignore malformed hrefs from arbitrary web pages.
    }
  }

  for (const match of Array.from(html.matchAll(rawUrlPattern))) {
    try {
      const url = new URL(decodeHtmlAttribute(match[0]));
      links.add(url.toString());
    } catch {
      // Ignore malformed raw URLs.
    }
  }

  return Array.from(links).sort((a, b) => {
    const ah = new URL(a).hostname === base.hostname ? 0 : 1;
    const bh = new URL(b).hostname === base.hostname ? 0 : 1;
    return ah - bh;
  });
}

export async function fetchPdfFromWeb(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchedPdf> {
  const startUrl = new URL(rawUrl);
  if (startUrl.protocol !== "http:" && startUrl.protocol !== "https:") {
    throw new PdfFetchError("Enter an http or https URL");
  }

  const response = await fetcher(startUrl.toString(), {
    headers: { Accept: "application/pdf,text/html;q=0.9,*/*;q=0.1" },
    redirect: "follow",
  });
  if (!response.ok) throw new PdfFetchError(`Could not fetch URL (${response.status})`);

  const finalUrl = new URL(response.url || startUrl.toString());
  if (looksLikePdfResponse(response, finalUrl)) {
    return {
      buffer: await readPdfBuffer(response),
      sourceUrl: finalUrl.toString(),
      titleFallback: titleFromUrl(finalUrl),
    };
  }

  if (!looksLikeHtmlResponse(response)) {
    throw new PdfFetchError("That URL is not a PDF and does not look like a page with PDF links");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw new PdfFetchError("That page is too large to scan for PDFs");
  }

  const html = await response.text();
  if (html.length > MAX_HTML_BYTES) {
    throw new PdfFetchError("That page is too large to scan for PDFs");
  }

  const candidates = findPdfLinks(html, finalUrl.toString()).slice(0, 8);
  if (!candidates.length) {
    throw new PdfFetchError("No PDF link found on that page");
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const pdfUrl = new URL(candidate);
      const candidateResponse = await fetcher(pdfUrl.toString(), {
        headers: { Accept: "application/pdf,*/*;q=0.1" },
        redirect: "follow",
      });
      if (!candidateResponse.ok) {
        lastError = new PdfFetchError(`Could not fetch PDF link (${candidateResponse.status})`);
        continue;
      }

      const finalPdfUrl = new URL(candidateResponse.url || pdfUrl.toString());
      return {
        buffer: await readPdfBuffer(candidateResponse),
        sourceUrl: finalPdfUrl.toString(),
        titleFallback: titleFromUrl(finalPdfUrl),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof PdfFetchError) throw lastError;
  throw new PdfFetchError("No usable PDF link found on that page");
}

export const PDF_BUCKET = "reading-texts";
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

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

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 reserved
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  if (hostname === "::" || hostname === "::1") return true; // unspecified / loopback
  if (/^fe[89ab]/.test(hostname)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(hostname)) return true; // fc00::/7 unique-local
  const mapped = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1].split(".").map(Number));
  return false;
}

// WHATWG URL parsing canonicalizes IPv4 trick encodings (decimal,
// octal, hex) into dotted-quad form, so checking url.hostname here
// covers e.g. http://2130706433/ -> 127.0.0.1.
export function isForbiddenHost(rawHostname: string): boolean {
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    hostname === "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    return true;
  }

  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return true;
    return isPrivateIpv4(octets);
  }

  if (hostname.includes(":")) return isPrivateIpv6(hostname);

  return false;
}

export function assertPublicWebUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PdfFetchError("Enter an http or https URL");
  }
  if (isForbiddenHost(url.hostname)) {
    throw new PdfFetchError("That URL points to a private or internal address");
  }
}

// Follows redirects manually so every hop is validated against
// private/internal hosts, not just the first URL.
async function fetchPublic(
  startUrl: URL,
  fetcher: typeof fetch,
  accept: string,
): Promise<{ response: Response; finalUrl: URL }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertPublicWebUrl(url);
    const response = await fetcher(url.toString(), {
      headers: { Accept: accept },
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new PdfFetchError("Redirect without a destination");
      url = new URL(location, url);
      continue;
    }

    return { response, finalUrl: url };
  }
  throw new PdfFetchError("Too many redirects");
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
  const { response, finalUrl } = await fetchPublic(
    startUrl,
    fetcher,
    "application/pdf,text/html;q=0.9,*/*;q=0.1",
  );
  if (!response.ok) throw new PdfFetchError(`Could not fetch URL (${response.status})`);
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
      const { response: candidateResponse, finalUrl: finalPdfUrl } = await fetchPublic(
        new URL(candidate),
        fetcher,
        "application/pdf,*/*;q=0.1",
      );
      if (!candidateResponse.ok) {
        lastError = new PdfFetchError(`Could not fetch PDF link (${candidateResponse.status})`);
        continue;
      }

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

import { describe, expect, it } from "vitest";
import {
  PdfFetchError,
  cleanTitle,
  fetchPdfFromWeb,
  findPdfLinks,
  isPdfBytes,
  titleFromUrl,
} from "./pdf";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function asPdfBuffer(): ArrayBuffer {
  return PDF_MAGIC.slice().buffer;
}

function makeResponse(body: BodyInit, init: ResponseInit & { url?: string } = {}): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: init.url ?? "" });
  return response;
}

describe("cleanTitle", () => {
  it("strips trailing .pdf and trims, falling back when blank", () => {
    expect(cleanTitle(" Tractatus.pdf ", "fallback")).toBe("Tractatus");
    expect(cleanTitle("", "fallback")).toBe("fallback");
    expect(cleanTitle(null, "fallback")).toBe("fallback");
  });

  it("caps title length at 180 chars", () => {
    expect(cleanTitle("a".repeat(500), "fallback").length).toBe(180);
  });
});

describe("titleFromUrl", () => {
  it("decodes the last path segment and humanises separators", () => {
    expect(titleFromUrl(new URL("https://x.test/the_phenomenology-of-spirit.pdf"))).toBe(
      "the phenomenology of spirit.pdf",
    );
  });

  it("falls back to hostname when path is empty", () => {
    expect(titleFromUrl(new URL("https://x.test/"))).toBe("x.test");
  });
});

describe("isPdfBytes", () => {
  it("accepts the PDF magic number", () => {
    expect(isPdfBytes(asPdfBuffer())).toBe(true);
  });

  it("rejects anything that doesn't start with %PDF-", () => {
    expect(isPdfBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]).buffer)).toBe(false);
    expect(isPdfBytes(new Uint8Array([]).buffer)).toBe(false);
  });
});

describe("findPdfLinks", () => {
  it("returns absolute PDF URLs and prefers same-host results", () => {
    const html = `
      <a href="/papers/spinoza.pdf">Spinoza</a>
      <a href='https://other.test/leibniz.pdf'>Leibniz</a>
      Visit https://www.local.test/raw.pdf for more.
      <a href="javascript:alert(1)">skip</a>
      <a href="#anchor">skip</a>
    `;
    const links = findPdfLinks(html, "https://www.local.test/index.html");
    expect(links).toContain("https://www.local.test/papers/spinoza.pdf");
    expect(links).toContain("https://other.test/leibniz.pdf");
    expect(links).toContain("https://www.local.test/raw.pdf");
    // same-host first
    expect(new URL(links[0]).hostname).toBe("www.local.test");
  });

  it("ignores javascript: and fragment hrefs", () => {
    const links = findPdfLinks(
      '<a href="javascript:bad()">x</a><a href="#x">y</a>',
      "https://x.test/",
    );
    expect(links).toEqual([]);
  });
});

describe("fetchPdfFromWeb", () => {
  it("rejects non-http(s) URLs", async () => {
    await expect(fetchPdfFromWeb("ftp://x.test/file.pdf")).rejects.toBeInstanceOf(PdfFetchError);
  });

  it("returns the buffer when the URL serves a PDF directly", async () => {
    const fakeFetch: typeof fetch = async () =>
      makeResponse(asPdfBuffer(), {
        status: 200,
        headers: { "content-type": "application/pdf" },
        url: "https://x.test/file.pdf",
      });

    const result = await fetchPdfFromWeb("https://x.test/file.pdf", fakeFetch);
    expect(isPdfBytes(result.buffer)).toBe(true);
    expect(result.sourceUrl).toBe("https://x.test/file.pdf");
  });

  it("rejects a non-PDF body even if content-type claims PDF", async () => {
    const fakeFetch: typeof fetch = async () =>
      makeResponse("not a pdf", {
        status: 200,
        headers: { "content-type": "application/pdf" },
        url: "https://x.test/file.pdf",
      });

    await expect(fetchPdfFromWeb("https://x.test/file.pdf", fakeFetch)).rejects.toBeInstanceOf(
      PdfFetchError,
    );
  });

  it("follows a single PDF link discovered in an HTML page", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://x.test/index") {
        return makeResponse(
          `<html><a href="https://x.test/paper.pdf">Paper</a></html>`,
          {
            status: 200,
            headers: { "content-type": "text/html" },
            url,
          },
        );
      }
      if (url === "https://x.test/paper.pdf") {
        return makeResponse(asPdfBuffer(), {
          status: 200,
          headers: { "content-type": "application/pdf" },
          url,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await fetchPdfFromWeb("https://x.test/index", fakeFetch);
    expect(result.sourceUrl).toBe("https://x.test/paper.pdf");
  });

  it("rejects responses that are neither PDF nor HTML", async () => {
    const fakeFetch: typeof fetch = async () =>
      makeResponse("binary garbage", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
        url: "https://x.test/blob",
      });

    await expect(fetchPdfFromWeb("https://x.test/blob", fakeFetch)).rejects.toBeInstanceOf(
      PdfFetchError,
    );
  });
});

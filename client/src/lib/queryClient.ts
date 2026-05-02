import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Visitor identity. Persists per-tab via window.name (which DOES work in
// sandboxed iframes when localStorage doesn't), and falls back to a fresh
// random id for the first request.
function getVisitorId(): string {
  try {
    if (typeof window !== "undefined") {
      const w = window as any;
      if (w.__pilpul_vid) return w.__pilpul_vid;
      // window.name survives reloads within the same tab and works in iframes
      const existing = window.name && window.name.startsWith("pil-") ? window.name : null;
      const id =
        existing ||
        "pil-" +
          (crypto?.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2) + Date.now().toString(36));
      window.name = id;
      w.__pilpul_vid = id;
      return id;
    }
  } catch {}
  return "pil-anon";
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "X-Visitor-Id": getVisitorId(),
    ...(extra ?? {}),
  };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: authHeaders(data && !isFormData ? { "Content-Type": "application/json" } : undefined),
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey
      .filter((k) => k !== undefined && k !== null)
      .map((k) => String(k))
      .join("/")
      .replace(/\/+/g, "/");
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

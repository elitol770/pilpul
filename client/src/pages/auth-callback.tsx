import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { apiRequest, queryClient } from "@/lib/queryClient";

function tokenFromHash(): string | null {
  const [, query = ""] = window.location.hash.split("?");
  return new URLSearchParams(query).get("token");
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = tokenFromHash();
      if (!token) {
        setError("This sign-in link is missing its token.");
        return;
      }

      try {
        const response = await apiRequest("POST", "/api/auth/verify", { token });
        const body = (await response.json()) as { redirectPath?: string };
        await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
        if (!cancelled) setLocation(body.redirectPath || "/");
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message?.replace(/^\d+:\s*/, "") || "This sign-in link is invalid or expired.");
        }
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  return (
    <PageShell narrow>
      <div className="pt-8">
        <span className="smallcaps">sign in</span>
        <p className="font-serif italic text-xl mt-2">
          {error ? "The link did not work." : "Opening Pilpul…"}
        </p>
        {error && <p className="text-destructive text-sm mt-3">{error}</p>}
      </div>
    </PageShell>
  );
}

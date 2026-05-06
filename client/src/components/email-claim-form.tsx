import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type MagicLinkResponse = {
  ok: boolean;
  sent: boolean;
  devLink?: string;
};

function currentRedirectPath(): string {
  const hashPath = window.location.hash.replace(/^#/, "") || "/";
  if (!hashPath.startsWith("/") || hashPath.startsWith("//")) return "/";
  return hashPath;
}

export function EmailClaimForm({
  compact = false,
  buttonLabel = "enter",
}: {
  compact?: boolean;
  buttonLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setSentTo(null);
    setDevLink(null);
    try {
      const response = await apiRequest("POST", "/api/auth/magic-link", {
        email,
        redirectPath: currentRedirectPath(),
      });
      const body = (await response.json()) as MagicLinkResponse;
      setSentTo(email);
      setDevLink(body.devLink ?? null);
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? "" : "mt-8"}>
      <label className="smallcaps block mb-2" htmlFor={compact ? "landing-email" : "email"}>
        email
      </label>
      <div className={compact ? "flex flex-col sm:flex-row gap-3" : ""}>
        <input
          id={compact ? "landing-email" : "email"}
          data-testid="input-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
          placeholder="you@somewhere.com"
          autoFocus={!compact}
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="button-enter"
          className={
            (compact ? "sm:w-auto" : "mt-6") +
            " px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic whitespace-nowrap"
          }
        >
          {busy ? "sending..." : buttonLabel}
        </button>
      </div>
      {err && (
        <p className="text-destructive text-sm mt-2" data-testid="text-error">
          {err}
        </p>
      )}
      {sentTo && (
        <div className="mt-3 text-sm text-muted-foreground leading-relaxed" data-testid="text-magic-link-sent">
          <p>
            Check {sentTo}. The link expires in 20 minutes.
          </p>
          {devLink && (
            <a href={devLink} className="inline-block mt-2 underline underline-offset-4 text-foreground">
              open local sign-in link
            </a>
          )}
        </div>
      )}
    </form>
  );
}

import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiRequest("POST", "/api/claim-email", { email });
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
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
          {busy ? "opening..." : buttonLabel}
        </button>
      </div>
      {err && (
        <p className="text-destructive text-sm mt-2" data-testid="text-error">
          {err}
        </p>
      )}
    </form>
  );
}

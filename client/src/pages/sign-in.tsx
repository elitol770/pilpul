import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageShell } from "@/components/page-shell";

export default function SignIn() {
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
    <PageShell narrow>
      <div className="pt-8 pb-12">
        <h1 className="font-serif text-2xl mb-3">Find a partner. Read one book together.</h1>
        <p className="text-muted-foreground leading-relaxed">
          Chavruta pairs two people, anywhere on Earth, for sustained one-on-one study of a
          shared text. Enter your email to begin. We will not send you anything you didn't ask for.
        </p>

        <form onSubmit={submit} className="mt-8">
          <label className="smallcaps block mb-2" htmlFor="email">
            email
          </label>
          <input
            id="email"
            data-testid="input-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            placeholder="you@somewhere.com"
            autoFocus
          />
          {err && (
            <p className="text-destructive text-sm mt-2" data-testid="text-error">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            data-testid="button-enter"
            className="mt-6 px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
          >
            {busy ? "opening…" : "enter"}
          </button>
        </form>

        <p className="mt-12 text-xs text-muted-foreground italic">
          By continuing, you confirm you are 18 or older.
        </p>
      </div>
    </PageShell>
  );
}

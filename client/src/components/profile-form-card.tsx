import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function ProfileFormCard({ onSaved }: { onSaved?: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await apiRequest("PATCH", "/api/me", {
        firstName,
        city,
        timezone: tz,
        ageConfirmed: confirmed,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      onSaved?.();
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-border bg-card rounded-sm p-6 mt-4">
      <span className="smallcaps">first, a name</span>
      <p className="font-serif italic mt-1 mb-4">
        Your partner sees your first name and city. Nothing else.
      </p>
      <div className="grid gap-3">
        <div>
          <label className="smallcaps block mb-1">first name</label>
          <input
            data-testid="input-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="smallcaps block mb-1">city</label>
          <input
            data-testid="input-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
            placeholder="Lisbon, Tokyo, Mexico City..."
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground mt-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="checkbox-age"
            className="mt-1"
          />
          <span>I confirm I am 18 years of age or older.</span>
        </label>
      </div>
      {err && <p className="text-destructive text-sm mt-3">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        data-testid="button-save-profile"
        className="mt-5 px-5 py-2 border border-border bg-background hover-elevate active-elevate-2 rounded-sm font-serif italic"
      >
        {busy ? "saving..." : "continue"}
      </button>
    </form>
  );
}

import { useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { PdfTextPicker } from "@/components/pdf-text-picker";
import { ProfileFormCard } from "@/components/profile-form-card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DirectInvite } from "@shared/schema";

const PACES = [
  { value: "slow", label: "slow", desc: "~10 pp/wk" },
  { value: "medium", label: "medium", desc: "~25 pp/wk" },
  { value: "fast", label: "fast", desc: "~50 pp/wk" },
] as const;

const COMMITMENTS = [
  { value: "casual", label: "casual", desc: "loose rhythm" },
  { value: "serious", label: "serious", desc: "finish the text" },
] as const;

export default function CreateRoom() {
  const { user } = useAuth();
  const [textTitle, setTextTitle] = useState("");
  const [pace, setPace] = useState<"slow" | "medium" | "fast">("medium");
  const [commitment, setCommitment] = useState<"casual" | "serious">("serious");
  const [language, setLanguage] = useState("English");
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<DirectInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const needsProfile = user && (!user.firstName || !user.city || !user.ageConfirmed);

  if (user?.matchingSuspendedAt) {
    return (
      <PageShell narrow>
        <div className="border border-border bg-card rounded-sm p-6 mt-4">
          <span className="smallcaps">matching paused</span>
          <p className="font-serif italic text-xl mt-1">You cannot create a room right now.</p>
          <p className="text-muted-foreground mt-2">
            A report needs maintainer review before this account can be matched again.
          </p>
        </div>
      </PageShell>
    );
  }

  if (needsProfile) {
    return (
      <PageShell narrow>
        <ProfileFormCard />
      </PageShell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const response = await apiRequest("POST", "/api/invites", {
        textTitle,
        textSourceId: selectedTextId,
        pace,
        commitment,
        scheduleWindows: null,
        language,
      });
      const body = (await response.json()) as { invite: DirectInvite };
      setInvite(body.invite);
      await queryClient.invalidateQueries({ queryKey: ["/api/hum"] });
    } catch (e: any) {
      setErr(e.message?.replace(/^\d+:\s*/, "") || "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  const inviteLink =
    invite && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#/invite/${invite.token}`
      : "";

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard?.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <PageShell narrow>
      <div className="pt-4">
        <span className="smallcaps">create a room</span>
        <h1 className="font-serif text-xl mt-1 mb-2">Invite someone directly.</h1>
        <p className="text-muted-foreground italic">
          Bring your own partner. Choose the text, share one link, and the room opens as soon as
          they accept.
        </p>

        {invite ? (
          <div className="border-y border-border py-6 mt-8">
            <span className="smallcaps">invite ready</span>
            <p className="font-serif italic text-xl mt-1">{invite.textTitle}</p>
            <p className="text-muted-foreground text-sm mt-2">
              Send this link to the person you want to study with. When they accept, Pilpul creates
              the shared room.
            </p>
            <input
              readOnly
              value={inviteLink}
              data-testid="input-invite-link"
              className="mt-4 w-full bg-card border border-border rounded-sm px-3 py-2 outline-none text-sm"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyInvite}
                data-testid="button-copy-invite"
                className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
              >
                {copied ? "copied" : "copy link"}
              </button>
              <Link
                href="/requests"
                className="px-5 py-2 border border-border rounded-sm hover-elevate"
              >
                browse requests
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-8">
            <div>
              <label className="smallcaps block mb-2">the text</label>
              <input
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                required
                autoFocus
                data-testid="input-create-text-title"
                className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
              />
              <PdfTextPicker
                textTitle={textTitle}
                selectedTextId={selectedTextId}
                onSelectedTextIdChange={setSelectedTextId}
                onTitleSuggestion={(title) => setTextTitle(title)}
                description="Attach a PDF now, or create the invite with just the title."
                uploadTestId="input-create-pdf-upload"
                urlTestId="input-create-pdf-url"
                fetchTestId="button-create-fetch-pdf"
              />
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <label className="smallcaps block mb-2">pace</label>
                <div className="grid grid-cols-3 gap-2">
                  {PACES.map((p) => (
                    <button
                      type="button"
                      key={p.value}
                      onClick={() => setPace(p.value)}
                      className={
                        "border rounded-sm py-3 px-3 text-left hover-elevate " +
                        (pace === p.value ? "border-foreground bg-card" : "border-border bg-card")
                      }
                    >
                      <span className="font-serif italic block">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="smallcaps block mb-2">commitment</label>
                <div className="grid grid-cols-2 gap-2">
                  {COMMITMENTS.map((c) => (
                    <button
                      type="button"
                      key={c.value}
                      onClick={() => setCommitment(c.value)}
                      className={
                        "border rounded-sm py-3 px-3 text-left hover-elevate " +
                        (commitment === c.value
                          ? "border-foreground bg-card"
                          : "border-border bg-card")
                      }
                    >
                      <span className="font-serif italic block">{c.label}</span>
                      <span className="text-xs text-muted-foreground">{c.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="smallcaps block mb-2">language of conversation</label>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary"
              />
            </div>

            {err && <p className="text-destructive text-sm">{err}</p>}

            <div className="rule" />
            <button
              type="submit"
              disabled={busy}
              data-testid="button-create-invite"
              className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
            >
              {busy ? "creating..." : "create invite link"}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}

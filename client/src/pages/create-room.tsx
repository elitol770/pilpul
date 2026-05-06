import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { ProfileFormCard } from "@/components/profile-form-card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DirectInvite, ReadingText } from "@shared/schema";

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
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfBusy, setPdfBusy] = useState<"upload" | "fetch" | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<DirectInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: textData } = useQuery<{ texts: ReadingText[] }>({ queryKey: ["/api/texts"] });
  const selectedText = textData?.texts.find((text) => text.id === selectedTextId) ?? null;
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

  function rememberText(text: ReadingText) {
    queryClient.setQueryData<{ texts: ReadingText[] }>(["/api/texts"], (current) => ({
      texts: [text, ...(current?.texts.filter((item) => item.id !== text.id) ?? [])],
    }));
    setSelectedTextId(text.id);
    setTextTitle((current) => current || text.title);
  }

  async function uploadPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setPdfBusy("upload");
    setPdfErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", textTitle || file.name.replace(/\.pdf$/i, ""));
      const response = await apiRequest("POST", "/api/texts/upload", form);
      const body = (await response.json()) as { text: ReadingText };
      rememberText(body.text);
      await queryClient.invalidateQueries({ queryKey: ["/api/texts"] });
    } catch (e: any) {
      setPdfErr(e.message?.replace(/^\d+:\s*/, "") || "Could not upload PDF");
    } finally {
      setPdfBusy(null);
      input.value = "";
    }
  }

  async function fetchPdf() {
    if (!pdfUrl.trim()) return;

    setPdfBusy("fetch");
    setPdfErr(null);
    try {
      const response = await apiRequest("POST", "/api/texts/fetch", {
        url: pdfUrl.trim(),
        title: textTitle || undefined,
      });
      const body = (await response.json()) as { text: ReadingText };
      rememberText(body.text);
      setPdfUrl("");
      await queryClient.invalidateQueries({ queryKey: ["/api/texts"] });
    } catch (e: any) {
      setPdfErr(e.message?.replace(/^\d+:\s*/, "") || "Could not fetch PDF");
    } finally {
      setPdfBusy(null);
    }
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
              <Link href="/requests" className="px-5 py-2 border border-border rounded-sm hover-elevate">
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
              <div className="mt-4 border-y border-border py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="smallcaps block">pdf</span>
                    <p className="text-xs text-muted-foreground italic mt-1">
                      Attach a PDF now, or create the invite with just the title.
                    </p>
                  </div>
                  {selectedText && (
                    <button
                      type="button"
                      onClick={() => setSelectedTextId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      remove
                    </button>
                  )}
                </div>

                {selectedText && (
                  <p className="mt-3 text-sm font-serif italic">Using {selectedText.title}</p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={uploadPdf}
                    disabled={pdfBusy !== null}
                    data-testid="input-create-pdf-upload"
                    className="block w-full text-sm file:mr-3 file:rounded-sm file:border file:border-border file:bg-card file:px-3 file:py-2 file:font-serif file:italic file:text-foreground"
                  />
                  <span className="self-center text-xs text-muted-foreground tabular">max 50 MB</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    value={pdfUrl}
                    onChange={(e) => setPdfUrl(e.target.value)}
                    placeholder="https://example.org/text-or-page"
                    data-testid="input-create-pdf-url"
                    className="flex-1 min-w-0 bg-card border border-border rounded-sm px-3 py-2 outline-none focus:border-primary text-sm"
                  />
                  <button
                    type="button"
                    onClick={fetchPdf}
                    disabled={pdfBusy !== null || !pdfUrl.trim()}
                    data-testid="button-create-fetch-pdf"
                    className="px-3 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic text-sm whitespace-nowrap"
                  >
                    {pdfBusy === "fetch" ? "fetching..." : "fetch"}
                  </button>
                </div>

                {!!textData?.texts.length && (
                  <div className="mt-4 space-y-2">
                    <span className="smallcaps block">your PDFs</span>
                    {textData.texts.slice(0, 4).map((text) => (
                      <button
                        type="button"
                        key={text.id}
                        onClick={() => {
                          setSelectedTextId(text.id);
                          setTextTitle((current) => current || text.title);
                        }}
                        className={
                          "w-full text-left border rounded-sm px-3 py-2 hover-elevate " +
                          (selectedTextId === text.id ? "border-foreground bg-card" : "border-border bg-card")
                        }
                      >
                        <span className="font-serif italic block truncate">{text.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {text.sourceKind === "web_pdf" ? "web PDF" : "uploaded PDF"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {pdfBusy === "upload" && <p className="text-xs text-muted-foreground italic mt-3">uploading PDF...</p>}
                {pdfErr && <p className="text-destructive text-sm mt-3">{pdfErr}</p>}
              </div>
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
                        (commitment === c.value ? "border-foreground bg-card" : "border-border bg-card")
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

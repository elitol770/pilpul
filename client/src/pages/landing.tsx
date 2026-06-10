import { useEffect, useState } from "react";
import { Link } from "wouter";
import { EmailClaimForm } from "@/components/email-claim-form";
import { PageShell } from "@/components/page-shell";

export default function Landing() {
  return (
    <PageShell wide>
      <section className="pt-5 md:pt-10">
        <div className="max-w-[760px]">
          <span
            className="smallcaps fade-up inline-block"
            style={{ "--fade-delay": "0.05s" } as React.CSSProperties}
          >
            one text, two minds
          </span>
          <InkHeadline />
          <p
            className="fade-up mt-6 max-w-[620px] text-lg leading-relaxed text-muted-foreground"
            style={{ "--fade-delay": "1.25s" } as React.CSSProperties}
          >
            Pilpul pairs people anywhere in the world to read a shared text together. Bring a PDF,
            fetch one from the web, set a weekly rhythm, and enter a room built for the work.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <StudyRoomPreview />
          <aside className="order-1 lg:order-2 border-y border-border py-5">
            <p className="font-serif italic text-xl leading-snug">
              The app succeeds when you leave it and go study.
            </p>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              No feeds, streaks, badges, ads, public profiles, or notifications trying to pull you
              back in. The pair is the unit. The book is the task.
            </p>
            <div className="mt-5">
              <EmailClaimForm compact buttonLabel="begin" />
              <p className="mt-3 text-xs text-muted-foreground italic">
                You will confirm you are 18 or older before entering matching.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-3">
        <Step number="1" title="Bring the text">
          Upload a private PDF or paste a page URL that links to a PDF. Pilpul does not need a
          catalog to be useful.
        </Step>
        <Step number="2" title="Set the rhythm">
          Choose pace, seriousness, language, and weekly availability. Matching favors pairs who can
          actually meet.
        </Step>
        <Step number="3" title="Enter the room">
          Read on one side, write together on the other, and open voice or video when the session
          begins.
        </Step>
      </section>

      <section className="mt-16 border-t border-border pt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div>
          <span className="smallcaps">mission</span>
          <h2 className="font-serif italic text-2xl mt-2">Books finished. Minds sharpened.</h2>
        </div>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Pilpul is built for the old practice of learning with another person: a partner who
            notices what you missed, resists your easy reading, and helps you stay with a text long
            enough for it to change you.
          </p>
          <p>
            AI is available only when summoned. It can explain, argue, or help locate sources, but
            it does not replace the conversation.
          </p>
          <Link
            href="/about"
            className="inline-block text-sm underline underline-offset-4 text-foreground"
          >
            read the mission
          </Link>
          <a
            href="https://github.com/elitol770/pilpul"
            className="ml-5 inline-block text-sm underline underline-offset-4 text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            contribute on GitHub
          </a>
        </div>
      </section>
    </PageShell>
  );
}

// The headline inks itself in word by word, then a pen stroke
// underlines the part that matters most. One-time entrance, not a
// loop; reduced motion renders it static.
const HEADLINE_WORDS = ["A", "quiet", "room", "for", "sustained", "study", "with"];
const UNDERLINED_WORDS = ["one", "other", "person."];

function InkHeadline() {
  return (
    <h1 className="font-serif text-[2.4rem] leading-[1.05] md:text-[4.6rem] md:leading-[0.98] mt-4">
      {HEADLINE_WORDS.map((word, index) => (
        <span key={word + index}>
          <span className="ink-word" style={{ "--ink-i": index } as React.CSSProperties}>
            {word}
          </span>{" "}
        </span>
      ))}
      <span className="pen-underline">
        {UNDERLINED_WORDS.map((word, index) => (
          <span key={word}>
            {index > 0 ? " " : ""}
            <span
              className="ink-word"
              style={{ "--ink-i": HEADLINE_WORDS.length + index } as React.CSSProperties}
            >
              {word}
            </span>
          </span>
        ))}
        <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
          <path d="M1.5 5.8 C 18 2.4, 36 6.6, 52 4.1 S 84 2.0, 98.5 4.9" pathLength="1" />
        </svg>
      </span>
    </h1>
  );
}

// The notebook writes itself in turns — one partner asks, the other
// answers — so the preview reads as a session in motion rather than a
// screenshot. Falls back to the static version for reduced motion.
const NOTEBOOK_LINES = [
  {
    className: "font-serif italic text-foreground",
    text: "Question: is patience a discipline or a mood?",
  },
  { className: "", text: "Yael: he is not asking for withdrawal. He is asking for steadiness." },
  { className: "", text: "Next week: Book IV, sections 1-8." },
];

const TYPE_MS = 34;
const HOLD_BEFORE = 900;
const HOLD_BETWEEN = 1400;
const HOLD_END = 4600;

const LINE_STARTS = NOTEBOOK_LINES.reduce<number[]>((starts, _, index) => {
  if (index === 0) return [HOLD_BEFORE];
  const previous = NOTEBOOK_LINES[index - 1];
  starts.push(starts[index - 1] + previous.text.length * TYPE_MS + HOLD_BETWEEN);
  return starts;
}, []);

const LOOP_MS =
  LINE_STARTS[NOTEBOOK_LINES.length - 1] +
  NOTEBOOK_LINES[NOTEBOOK_LINES.length - 1].text.length * TYPE_MS +
  HOLD_END;

function usePreviewClock(): { elapsed: number; seconds: number; animate: boolean } {
  const [animate, setAnimate] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);
    const startedAt = Date.now();
    const interval = window.setInterval(() => setTick(Date.now() - startedAt), 50);
    return () => window.clearInterval(interval);
  }, []);

  return { elapsed: tick % LOOP_MS, seconds: Math.floor(tick / 1000), animate };
}

function StudyRoomPreview() {
  const { elapsed, seconds, animate } = usePreviewClock();

  const visibleChars = (index: number) => {
    if (!animate) return NOTEBOOK_LINES[index].text.length;
    return Math.max(
      0,
      Math.min(
        NOTEBOOK_LINES[index].text.length,
        Math.floor((elapsed - LINE_STARTS[index]) / TYPE_MS),
      ),
    );
  };

  const typingIndex = NOTEBOOK_LINES.findIndex(
    (line, index) => visibleChars(index) > 0 && visibleChars(index) < line.text.length,
  );

  // The reply engages the co-operation quote — highlight it while Yael writes.
  const yaelStart = LINE_STARTS[1];
  const yaelEnd = yaelStart + NOTEBOOK_LINES[1].text.length * TYPE_MS;
  const highlightQuote = animate && elapsed >= yaelStart && elapsed <= yaelEnd + HOLD_BETWEEN;

  const totalSeconds = 42 * 60 + 18 + (animate ? seconds : 0);
  const timer = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

  return (
    <div
      className="order-2 lg:order-1 border border-border bg-card rounded-sm overflow-hidden"
      aria-hidden="true"
    >
      <div className="grid grid-cols-2 min-h-[270px]">
        <div className="p-5 border-r border-border">
          <span className="smallcaps">text</span>
          <p className="font-serif italic text-xl mt-3">Meditations</p>
          <div className="rule my-4" />
          <div className="space-y-3 font-serif text-sm leading-relaxed">
            <p>Begin the morning by saying to thyself, I shall meet with the busy-body...</p>
            <p
              className={`transition-colors duration-700 ${highlightQuote ? "bg-accent/70" : "bg-transparent"}`}
            >
              For we are made for co-operation, like feet, like hands, like eyelids.
            </p>
          </div>
        </div>
        <div className="p-5">
          <span className="smallcaps">notebook</span>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            {NOTEBOOK_LINES.map((line, index) => {
              const chars = visibleChars(index);
              if (animate && chars === 0) return null;
              return (
                <p key={line.text} className={line.className}>
                  {line.text.slice(0, chars)}
                  {animate && index === typingIndex && (
                    <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-foreground/70 animate-pulse" />
                  )}
                </p>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="italic">AI is silent unless invoked.</span>
        <span className="tabular">{timer}</span>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4">
      <span className="smallcaps tabular">{number}</span>
      <h2 className="font-serif italic text-xl mt-2">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mt-2">{children}</p>
    </div>
  );
}

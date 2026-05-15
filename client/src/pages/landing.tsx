import { Link } from "wouter";
import { EmailClaimForm } from "@/components/email-claim-form";
import { PageShell } from "@/components/page-shell";

export default function Landing() {
  return (
    <PageShell wide>
      <section className="pt-5 md:pt-10">
        <div className="max-w-[760px]">
          <span className="smallcaps">one text, two minds</span>
          <h1 className="font-serif text-[2.4rem] leading-[1.05] md:text-[4.6rem] md:leading-[0.98] mt-4">
            A quiet room for sustained study with one other person.
          </h1>
          <p className="mt-6 max-w-[620px] text-lg leading-relaxed text-muted-foreground">
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
        </div>
      </section>
    </PageShell>
  );
}

function StudyRoomPreview() {
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
            <p>For we are made for co-operation, like feet, like hands, like eyelids.</p>
          </div>
        </div>
        <div className="p-5">
          <span className="smallcaps">notebook</span>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p className="font-serif italic text-foreground">
              Question: is patience a discipline or a mood?
            </p>
            <p>Yael: he is not asking for withdrawal. He is asking for steadiness.</p>
            <p>Next week: Book IV, sections 1-8.</p>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="italic">AI is silent unless invoked.</span>
        <span className="tabular">42:18</span>
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

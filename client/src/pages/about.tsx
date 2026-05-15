import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { useAuth } from "@/lib/auth";

export default function About() {
  const { user } = useAuth();

  return (
    <PageShell wide>
      <article className="pt-5 md:pt-10">
        <header className="max-w-[760px]">
          <span className="smallcaps">about pilpul</span>
          <h1 className="font-serif text-[2.2rem] leading-[1.08] md:text-[4rem] md:leading-[1] mt-4">
            A calm tool for reading one text with one other person.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Pilpul exists for sustained one-on-one study. Its success is measured in books finished,
            conversations deepened, and questions carried honestly from one session to the next.
          </p>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="border-y border-border py-5 h-fit">
            <p className="font-serif italic text-2xl leading-tight">
              The core promise is simple: one text, two minds, anywhere on Earth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={user ? "/find" : "/sign-in"}
                className="px-5 py-2 border border-border bg-card hover-elevate active-elevate-2 rounded-sm font-serif italic"
              >
                {user ? "find a partner" : "begin"}
              </Link>
              <Link href="/" className="px-5 py-2 border border-border rounded-sm hover-elevate">
                home
              </Link>
              <a
                href="https://github.com/elitol770/pilpul"
                className="px-5 py-2 border border-border rounded-sm hover-elevate"
                target="_blank"
                rel="noreferrer"
              >
                source
              </a>
            </div>
          </aside>

          <div className="space-y-10">
            <Section title="Why it exists">
              <p>
                Reading alone is useful. Reading with a serious partner is different. Another person
                slows you down, notices your assumptions, and makes the text answer to a living
                conversation.
              </p>
              <p>
                Pilpul is built to protect that encounter. The interface stays quiet so the session
                can carry the weight.
              </p>
            </Section>

            <Section title="What it is">
              <p>
                It is a small room on the internet: a reading pane, a shared notebook, and optional
                voice or video. You bring the material by uploading a PDF or importing a PDF from
                the web. Matching helps you find someone with compatible seriousness, language,
                pace, and weekly availability.
              </p>
              <p>
                The product is not trying to become a library, a course platform, or a public
                square. It is trying to help two people finish a text together.
              </p>
            </Section>

            <Section title="What it refuses">
              <ul className="space-y-3">
                <li>No feed. Nothing to scroll.</li>
                <li>No followers, likes, public profiles, streaks, badges, or engagement loops.</li>
                <li>No ads and no data harvesting.</li>
                <li>No AI that interrupts the room. The third seat is silent until summoned.</li>
              </ul>
            </Section>

            <Section title="How money should work">
              <p>
                The base product should be free to use. AI costs should be visible and honest. The
                intended model is bring-your-own-key or credits passed through near cost, not a
                premium tier that holds the study room hostage.
              </p>
            </Section>

            <Section title="Trust">
              <p>
                Pilpul pairs strangers for sustained contact, so safety is part of the design.
                Partners see first name and city, email is required, users confirm they are 18 or
                older before matching, and either partner can leave or report a pairing from the
                room.
              </p>
            </Section>

            <Section title="Open source">
              <p>
                The code is public so readers can inspect how matching, uploaded PDFs, notes,
                sessions, and bring-your-own-key AI work. Contributions are welcome when they keep
                the tool quiet, private, and centered on study.
              </p>
              <p>
                Start with the contributor guide or one of the small issues marked for first
                contributors.
              </p>
              <a
                href="https://github.com/elitol770/pilpul"
                className="inline-block text-sm underline underline-offset-4 text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                view the repository
              </a>
            </Section>
          </div>
        </div>
      </article>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h2 className="font-serif italic text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

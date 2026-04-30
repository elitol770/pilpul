import { Link } from "wouter";
import { ReactNode } from "react";

export function PageShell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 pt-8 pb-4">
        <div
          className={
            (narrow ? "max-w-[560px]" : "max-w-[720px]") +
            " mx-auto flex items-baseline justify-between"
          }
        >
          <Link href="/" className="font-serif italic text-xl tracking-tight" data-testid="link-home">
            Chavruta
          </Link>
          <span className="smallcaps">iron sharpens iron</span>
        </div>
        <div className={(narrow ? "max-w-[560px]" : "max-w-[720px]") + " mx-auto mt-3 rule"} />
      </header>

      <main className="flex-1 px-6 pb-16">
        <div className={(narrow ? "max-w-[560px]" : "max-w-[720px]") + " mx-auto"}>
          {children}
        </div>
      </main>

      <footer className="px-6 pb-10">
        <div className={(narrow ? "max-w-[560px]" : "max-w-[720px]") + " mx-auto"}>
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            A quiet place to study with one other person, anywhere.<br />
            Not a social network. No feeds, no streaks, no ads.
          </p>
        </div>
      </footer>
    </div>
  );
}

import { Link } from "wouter";
import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function PageShell({
  children,
  narrow,
  wide,
}: {
  children: ReactNode;
  narrow?: boolean;
  wide?: boolean;
}) {
  const { user } = useAuth();
  const width = narrow ? "max-w-[560px]" : wide ? "max-w-[1040px]" : "max-w-[720px]";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 pt-8 pb-4">
        <div className={width + " mx-auto flex items-baseline justify-between gap-4"}>
          <Link href="/" className="font-serif italic text-xl tracking-tight" data-testid="link-home">
            Pilpul
          </Link>
          <nav className="flex items-center gap-4 text-xs">
            {user && (
              <>
                <Link href="/requests" className="smallcaps hover:text-foreground">
                  requests
                </Link>
                <Link href="/create" className="smallcaps hover:text-foreground">
                  create
                </Link>
              </>
            )}
            <Link href="/about" className="smallcaps hover:text-foreground">
              about
            </Link>
            <span className="smallcaps hidden sm:inline">iron sharpens iron</span>
          </nav>
        </div>
        <div className={width + " mx-auto mt-3 rule"} />
      </header>

      <main className="flex-1 px-6 pb-16">
        <div className={width + " mx-auto"}>{children}</div>
      </main>

      <footer className="px-6 pb-10">
        <div className={width + " mx-auto"}>
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            A quiet place to study with one other person, anywhere.<br />
            Not a social network. No feeds, no streaks, no ads.
          </p>
        </div>
      </footer>
    </div>
  );
}

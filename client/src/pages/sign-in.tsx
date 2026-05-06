import { Link } from "wouter";
import { EmailClaimForm } from "@/components/email-claim-form";
import { PageShell } from "@/components/page-shell";

export default function SignIn() {
  return (
    <PageShell narrow>
      <div className="pt-8 pb-12">
        <h1 className="font-serif text-2xl mb-3">Enter Pilpul.</h1>
        <p className="text-muted-foreground leading-relaxed">
          Use the same email each time. Email verification will be added before public launch.
        </p>

        <EmailClaimForm />

        <p className="mt-12 text-xs text-muted-foreground italic">
          You will confirm you are 18 or older before entering the queue.
        </p>
        <Link href="/" className="inline-block mt-6 text-sm underline underline-offset-4">
          return to the landing page
        </Link>
      </div>
    </PageShell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignInForm, SignUpForm } from "@/components/account/AccountForms";
import { providerInfo } from "@/lib/ai/provider";
import { getViewer } from "@/lib/identity";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const viewer = await getViewer();
  if (viewer?.email) redirect("/dashboard");

  const provider = providerInfo();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[#1c1f25]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Brand />
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            <ArrowLeft size={13} aria-hidden /> Back to workspace
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f626b]">
          Your identity
        </p>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">
          Keep your interface on every device.
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#82858f]">
          Workspace data is shared. Your interface and your role belong to your identity — so
          signing in with the same account on your laptop shows the layout you shaped on your
          phone.
        </p>
        {viewer ? (
          <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-[#6b6f7a]">
            Creating an account now claims this browser&apos;s identity ({viewer.name}), so the
            applications, revisions and role you already have come with you.
          </p>
        ) : null}

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <section className="rounded-[12px] border border-[#262a32] bg-[#0b0c0f] p-5">
            <h2 className="text-[13px] font-semibold text-[#c8cad2]">Create an account</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6b6f7a]">
              One account, one identity. Your personal interface documents stay yours.
            </p>
            <SignUpForm defaultName={viewer?.name} />
          </section>

          <section className="rounded-[12px] border border-[#262a32] bg-[#0b0c0f] p-5">
            <h2 className="text-[13px] font-semibold text-[#c8cad2]">Sign in</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6b6f7a]">
              Already have an account? Pick up the interface and role you left.
            </p>
            <SignInForm />
          </section>
        </div>

        <p className="mt-6 text-[11.5px] leading-relaxed text-[#5f626b]">
          Guests keep working: without an account this browser holds a private guest identity, and
          workspace data is shared with everyone here.{" "}
          {provider.kind === "model" ? `Generation runs on ${provider.model}.` : "Generation uses the local planner."}
        </p>
      </main>
    </div>
  );
}

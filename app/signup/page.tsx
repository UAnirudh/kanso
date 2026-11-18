import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/lib/auth";
import { Brand } from "@/components/brand";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main id="main" className="min-h-dvh bg-[#08090b]">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <Brand />
          <div className="max-w-md">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7cf8]">
              Start in two minutes
            </p>
            <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#e8e9ee]">
              Describe the workspace.
              <br />
              Then make it yours.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#9a9da8]">
              Your account comes with a private workspace. Generate a project workspace, add
              teammates, and let each person shape their own interface without touching anyone
              else&apos;s.
            </p>
          </div>
          <p className="text-xs text-[#5f626b]">
            Your password is hashed with scrypt; sessions are httpOnly cookies.
          </p>
        </div>

        <div className="flex items-center justify-center border-l border-[#1c1f25] px-6 py-14">
          <div className="w-full max-w-[360px]">
            <div className="mb-8 lg:hidden">
              <Brand />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">Create your account</h2>
            <p className="mt-1.5 text-sm text-[#82858f]">
              No credit card, no setup wizard. You land in a working workspace.
            </p>
            <SignupForm />
            <p className="mt-6 text-sm text-[#82858f]">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-[#a496ff] hover:text-[#c4baff]">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

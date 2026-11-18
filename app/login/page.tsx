import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/lib/auth";
import { Brand } from "@/components/brand";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main id="main" className="min-h-dvh bg-[#08090b]">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <Brand />
          <div className="max-w-md">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7cf8]">
              Adaptive interfaces
            </p>
            <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#e8e9ee]">
              One application.
              <br />
              Everyone&apos;s own interface.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#9a9da8]">
              Kanso keeps the data, permissions and business logic shared — and lets every
              member arrange, restyle and rebuild their own view of it in plain language.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-[#c8cad2]">
              {[
                "Generate a working project workspace in seconds.",
                "Ask for a new layout; preview it before it applies.",
                "Every change is versioned, undoable and private to you.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#8b7cf8]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-[#5f626b]">
            Shared data · Per-user presentations · Validated, schema-driven changes
          </p>
        </div>

        <div className="flex items-center justify-center border-l border-[#1c1f25] px-6 py-14">
          <div className="w-full max-w-[360px]">
            <div className="mb-8 lg:hidden">
              <Brand />
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">Sign in</h2>
            <p className="mt-1.5 text-sm text-[#82858f]">
              Welcome back. Your interface is exactly where you left it.
            </p>
            <LoginForm />
            <p className="mt-6 text-sm text-[#82858f]">
              New here?{" "}
              <Link href="/signup" className="font-medium text-[#a496ff] hover:text-[#c4baff]">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

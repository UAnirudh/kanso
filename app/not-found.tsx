import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f626b]">
          404
        </p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-[-0.01em]">
          This application isn&apos;t available
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#82858f]">
          It may have been deleted, or your account is not a member of its workspace. Interfaces
          are private, but the underlying application still needs workspace access.
        </p>
        <Link href="/dashboard" className="btn btn-secondary mt-5">
          Back to your workspace
        </Link>
      </div>
    </main>
  );
}

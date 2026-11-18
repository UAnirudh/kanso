"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled error", error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md rounded-[14px] border border-[#262a32] bg-[#0b0c0f] p-6 text-center">
        <h1 className="text-[16px] font-semibold text-[#e8e9ee]">Something broke on this screen</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#82858f]">
          Your data and interface are safe. Retry the screen; if it keeps failing, check the server
          log for the stack trace.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <a href="/dashboard" className="btn btn-secondary">
            Back to dashboard
          </a>
        </div>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-[#4f525b]">ref: {error.digest}</p>
        )}
      </div>
    </main>
  );
}

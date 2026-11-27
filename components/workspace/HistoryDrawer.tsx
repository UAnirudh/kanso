"use client";

import { useEffect, useState } from "react";
import { History, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { RevisionView } from "./types";

const KIND_LABEL: Record<string, string> = {
  init: "Starting point",
  ai: "Assistant",
  manual: "Visual edit",
  restore: "Restored",
  undo: "Undo",
};

const KIND_TONE: Record<string, string> = {
  init: "text-[#82858f] border-[#262a32]",
  ai: "text-[#a496ff] border-[#8b7cf8]/40",
  manual: "text-[#7dd3fc] border-sky-500/30",
  restore: "text-amber-300 border-amber-500/30",
  undo: "text-amber-300 border-amber-500/30",
};

export function HistoryDrawer({
  open,
  history,
  busy,
  onClose,
  onRestore,
  onUndo,
  onReset,
}: {
  open: boolean;
  history: RevisionView[];
  busy: boolean;
  onClose: () => void;
  onRestore: (revisionId: string) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close version history"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        className="absolute right-0 top-0 flex h-full w-full max-w-[390px] flex-col border-l border-[#1c1f25] bg-[#0b0c0f] shadow-2xl"
      >
        <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-[#16191e] px-3.5">
          <div className="flex items-center gap-2">
            <History size={13} className="text-[#82858f]" aria-hidden />
            <h2 className="text-[12.5px] font-semibold text-[#e8e9ee]">Version history</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-icon tap-target" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="shrink-0 border-b border-[#16191e] p-3">
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={onUndo}
            disabled={busy || history.length < 2}
          >
            <Undo2 size={13} aria-hidden />
            Undo last change
          </button>
          <button
            type="button"
            className={`btn mt-2 w-full ${confirmReset ? "btn-danger" : "btn-ghost"}`}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              setConfirmReset(false);
              onReset();
            }}
            disabled={busy}
          >
            <Sparkles size={13} aria-hidden />
            {confirmReset ? "Confirm reset" : "Reset to the generated layout"}
          </button>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[#7f828d]">
            Only your interface is versioned. Teammates&apos; layouts are never touched by your
            changes or restores. A reset is saved as a version too, so you can undo it.
          </p>
        </div>

        <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {history.length === 0 && (
            <li className="px-1 py-6 text-center text-[12px] text-[#7f828d]">
              No versions recorded yet.
            </li>
          )}
          {history.map((revision, index) => (
            <li key={revision.id} className="border-b border-[#12151a] py-2.5 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-[4px] border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
                        KIND_TONE[revision.kind] ?? "border-[#262a32] text-[#82858f]"
                      }`}
                    >
                      {KIND_LABEL[revision.kind] ?? revision.kind}
                    </span>
                    {index === 0 && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/80">
                        current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-[#d5d7de]">{revision.label}</p>
                  <p className="mt-0.5 text-[10px] text-[#7f828d]">
                    {relativeTime(revision.createdAt)}
                  </p>
                </div>
                {index !== 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm tap-target shrink-0"
                    onClick={() => onRestore(revision.id)}
                    disabled={busy}
                    aria-label={`Restore version: ${revision.label}`}
                  >
                    <RotateCcw size={11} aria-hidden />
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

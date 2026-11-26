"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Check, Eye, Sparkles, Wand2, X } from "lucide-react";
import { operationLabel } from "@/lib/interface/templates";
import type { AiInfo, AiProposalView } from "./types";

const SUGGESTIONS = [
  "Move my tasks to the left, add a progress chart on the right, and switch to dark mode",
  "Make this feel like a focused dark tool with a collapsed sidebar",
  "Hide completed tasks and add a calendar",
  "Make this interface work better on mobile",
  "Replace the task table with a chart",
];

export function AiPanel({
  ai,
  proposal,
  busy,
  statusText,
  error,
  previewing,
  onSubmit,
  onApply,
  onDiscard,
  onTogglePreview,
  onClose,
}: {
  ai: AiInfo;
  proposal: AiProposalView | null;
  busy: boolean;
  statusText: string;
  error: { message: string; details?: string[] } | null;
  previewing: boolean;
  onSubmit: (prompt: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onTogglePreview: (next: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (proposal) textareaRef.current?.blur();
  }, [proposal]);

  const submit = () => {
    const prompt = draft.trim();
    if (prompt.length < 3 || busy) return;
    setLastPrompt(prompt);
    setDraft("");
    onSubmit(prompt);
  };

  const modelLabel = ai.kind === "model" ? ai.model : "rule planner";

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-[#1c1f25] bg-[#0b0c0f]">
      <header className="flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-[#16191e] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-[#8b7cf8]/14">
            <Sparkles size={11} className="text-[#a496ff]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-[#e8e9ee]">Interface assistant</p>
            <p className="truncate text-[10px] text-[#5f626b]">
              {ai.kind === "model" ? `Groq · ${modelLabel}` : "Local planner · no API key"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-icon tap-target"
          aria-label="Close assistant"
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!proposal && !busy && !error && (
          <div className="space-y-4">
            <div className="rounded-[9px] border border-[#1c1f25] bg-[#0e1014] p-3">
              <p className="text-[12px] leading-relaxed text-[#c8cad2]">
                Describe the interface you want. I only change layout, components and styling —
                never data or permissions.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#6b6f7a]">
                Every proposal is validated against the component schema and previewed before it
                touches your interface. You can undo it or restore any earlier version.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5f626b]">
                Try one
              </p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="w-full rounded-[7px] border border-[#1c1f25] bg-[#0d0f13] px-2.5 py-2 text-left text-[11.5px] leading-snug text-[#9a9da8] transition-colors hover:border-[#2a2e37] hover:text-[#e8e9ee]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {lastPrompt && (proposal || busy || error) && (
          <div className="mb-3 flex justify-end">
            <p className="max-w-[92%] rounded-[9px] rounded-br-[3px] border border-[#242832] bg-[#141821] px-2.5 py-2 text-[11.5px] leading-snug text-[#d5d7de]">
              {lastPrompt}
            </p>
          </div>
        )}

        {busy && (
          <div className="rounded-[9px] border border-[#1c1f25] bg-[#0e1014] p-3">
            <div className="flex items-center gap-2 text-[11.5px] text-[#a496ff]">
              <Wand2 size={12} className="animate-pulse" aria-hidden />
              {statusText}
            </div>
            <div className="mt-3 space-y-1.5" aria-hidden>
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-2 w-[82%]" />
              <div className="skeleton h-2 w-[64%]" />
            </div>
          </div>
        )}

        {error && !busy && (
          <div
            role="alert"
            className="rounded-[9px] border border-red-500/25 bg-red-500/[0.07] p-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-300" aria-hidden />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-red-200">No change was applied</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-red-200/80">{error.message}</p>
                {error.details && error.details.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-red-500/15 pt-2">
                    {error.details.slice(0, 4).map((detail) => (
                      <li key={detail} className="text-[10.5px] leading-relaxed text-red-200/70">
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10.5px] text-red-200/50">
                  Your interface is exactly as it was. Edit the request and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {proposal && !busy && (
          <div className="rise space-y-3">
            <div className="rounded-[9px] border border-[#2a2e37] bg-[#0e1014] p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8b7cf8]" aria-hidden />
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b7cf8]">
                  Proposed change
                </p>
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-snug text-[#e8e9ee]">
                {proposal.summary}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#82858f]">{proposal.message}</p>

              <ul className="mt-2.5 space-y-1 border-t border-[#1c1f25] pt-2.5">
                {proposal.operations.map((operation, index) => (
                  <li
                    key={`${operation.op}-${index}`}
                    className="flex items-start gap-1.5 text-[11px] text-[#9a9da8]"
                  >
                    <Check size={11} className="mt-0.5 shrink-0 text-emerald-400/70" aria-hidden />
                    {operationLabel(operation)}
                  </li>
                ))}
              </ul>

              {proposal.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-[#1c1f25] pt-2">
                  {proposal.warnings.map((warning) => (
                    <li key={warning} className="text-[10.5px] leading-relaxed text-amber-300/80">
                      {warning}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-2.5 border-t border-[#1c1f25] pt-2 text-[10px] text-[#4f525b]">
                {proposal.provider === "local-planner" ? "local planner" : `${proposal.provider} · ${proposal.model}`}
                {" · "}
                {proposal.latencyMs}ms
                {proposal.tokensIn + proposal.tokensOut > 0 &&
                  ` · ${proposal.tokensIn + proposal.tokensOut} tokens`}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={onApply}
                disabled={busy}
              >
                Apply change
              </button>
              <button type="button" className="btn btn-secondary" onClick={onDiscard}>
                Discard
              </button>
            </div>
            <button
              type="button"
              onClick={() => onTogglePreview(!previewing)}
              aria-pressed={previewing}
              className="flex w-full items-center justify-center gap-1.5 rounded-[7px] border border-[#1c1f25] py-1.5 text-[11px] text-[#82858f] transition-colors hover:border-[#2a2e37] hover:text-[#c8cad2]"
            >
              <Eye size={11} aria-hidden />
              {previewing ? "Hide preview" : "Preview on the canvas"}
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#16191e] p-2.5">
        <label className="sr-only" htmlFor="ai-prompt">
          Describe the interface change
        </label>
        <div className="rounded-[9px] border border-[#262a32] bg-[#0d0f13] p-1.5 focus-within:border-[#8b7cf8]/50">
          <textarea
            id="ai-prompt"
            ref={textareaRef}
            rows={2}
            value={draft}
            maxLength={600}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. put the task board on the left, chart on the right…"
            className="w-full resize-none bg-transparent px-1 text-[12px] leading-relaxed text-[#e8e9ee] outline-none placeholder:text-[#4f525b]"
            disabled={busy}
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[9.5px] text-[#4f525b]">
              Enter to send · Shift+Enter for a new line
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || draft.trim().length < 3}
              className="tap-target grid h-6 w-6 place-items-center rounded-[5px] bg-[#8b7cf8] text-[#0a0a0c] transition-opacity disabled:opacity-30"
              aria-label="Send request"
            >
              <ArrowUp size={13} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

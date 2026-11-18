"use client";

import { useState } from "react";
import {
  Check,
  Menu,
  Palette,
  PanelRight,
  PencilRuler,
  Plus,
  Sparkles,
} from "lucide-react";
import type { InterfaceOperation } from "@/lib/interface/operations";
import type { Accent, Density, Theme } from "@/lib/interface/types";

export interface AppearanceState {
  theme: Theme;
  accent: Accent;
  density: Density;
  navWidth: "compact" | "default";
  navCollapsed: boolean;
}

const ACCENTS: Array<{ value: Accent; color: string; label: string }> = [
  { value: "indigo", color: "#8b7cf8", label: "Indigo" },
  { value: "teal", color: "#2dd4bf", label: "Teal" },
  { value: "amber", color: "#fbbf24", label: "Amber" },
  { value: "rose", color: "#fb7185", label: "Rose" },
  { value: "slate", color: "#cbd5e1", label: "Slate" },
];

export function TopBar({
  appName,
  pageTitle,
  editMode,
  onToggleEdit,
  aiOpen,
  onToggleAi,
  onOpenSidebar,
  onNewTask,
  canEdit,
  busy,
  appearance,
  onAppearance,
}: {
  appName: string;
  pageTitle: string;
  editMode: boolean;
  onToggleEdit: () => void;
  aiOpen: boolean;
  onToggleAi: () => void;
  onOpenSidebar: () => void;
  onNewTask: () => void;
  canEdit: boolean;
  busy: boolean;
  appearance: AppearanceState;
  onAppearance: (operations: InterfaceOperation[], label: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative z-30 flex h-[46px] shrink-0 items-center justify-between gap-2 border-b border-[#16191e] bg-[#08090b] px-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="btn btn-ghost btn-icon lg:hidden"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
        >
          <Menu size={16} aria-hidden />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
          <span className="hidden max-w-[160px] truncate text-[#5f626b] sm:inline">{appName}</span>
          <span aria-hidden className="hidden text-[#2a2e37] sm:inline">
            /
          </span>
          <span className="truncate font-medium text-[#c8cad2]">{pageTitle}</span>
        </div>
        {busy && (
          <span className="ml-1 hidden text-[10px] text-[#6b6f7a] sm:inline" aria-live="polite">
            Saving…
          </span>
        )}
        {!busy && (
          <span className="ml-1 hidden items-center gap-1 text-[10px] text-emerald-400/60 sm:flex">
            <Check size={9} aria-hidden />
            Saved
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-label="Appearance settings"
          >
            <Palette size={14} aria-hidden />
            <span className="hidden md:inline">Appearance</span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close appearance settings"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="rise absolute right-0 top-[38px] z-40 w-[268px] rounded-[11px] border border-[#262a32] bg-[#0d0f13] p-3 shadow-2xl">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[#5f626b]">
                  Theme
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(["light", "dark"] as const).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      aria-pressed={appearance.theme === theme}
                      onClick={() =>
                        onAppearance(
                          [{ op: "setTheme", theme }],
                          theme === "dark" ? "Switched to dark theme" : "Switched to light theme",
                        )
                      }
                      className={`rounded-[6px] border px-2 py-1.5 text-[11.5px] capitalize transition-colors ${
                        appearance.theme === theme
                          ? "border-[#8b7cf8]/50 bg-[#8b7cf8]/12 text-[#c4baff]"
                          : "border-[#262a32] text-[#9a9da8] hover:text-[#e8e9ee]"
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[#5f626b]">
                  Accent
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent.value}
                      type="button"
                      aria-label={`${accent.label} accent`}
                      aria-pressed={appearance.accent === accent.value}
                      onClick={() =>
                        onAppearance(
                          [{ op: "setAccent", accent: accent.value }],
                          `${accent.label} accent`,
                        )
                      }
                      className={`grid h-6 w-6 place-items-center rounded-full border transition-transform ${
                        appearance.accent === accent.value
                          ? "scale-105 border-white/60"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ background: accent.color }}
                    >
                      {appearance.accent === accent.value && (
                        <Check size={11} className="text-[#0b0c0f]" aria-hidden />
                      )}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[#5f626b]">
                  Density
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(["comfortable", "compact"] as const).map((density) => (
                    <button
                      key={density}
                      type="button"
                      aria-pressed={appearance.density === density}
                      onClick={() =>
                        onAppearance(
                          [{ op: "setDensity", density }],
                          `${density} density`,
                        )
                      }
                      className={`rounded-[6px] border px-2 py-1.5 text-[11.5px] capitalize transition-colors ${
                        appearance.density === density
                          ? "border-[#8b7cf8]/50 bg-[#8b7cf8]/12 text-[#c4baff]"
                          : "border-[#262a32] text-[#9a9da8] hover:text-[#e8e9ee]"
                      }`}
                    >
                      {density}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[#5f626b]">
                  Sidebar width
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {(["default", "compact"] as const).map((width) => (
                    <button
                      key={width}
                      type="button"
                      aria-pressed={appearance.navWidth === width}
                      onClick={() =>
                        onAppearance(
                          [{ op: "setNavWidth", width }],
                          width === "compact" ? "Compact navigation" : "Default navigation",
                        )
                      }
                      className={`rounded-[6px] border px-2 py-1.5 text-[11.5px] capitalize transition-colors ${
                        appearance.navWidth === width
                          ? "border-[#8b7cf8]/50 bg-[#8b7cf8]/12 text-[#c4baff]"
                          : "border-[#262a32] text-[#9a9da8] hover:text-[#e8e9ee]"
                      }`}
                    >
                      {width}
                    </button>
                  ))}
                </div>

                <p className="mt-3 border-t border-[#1c1f25] pt-2 text-[10px] leading-relaxed text-[#4f525b]">
                  These edits are versioned like any other change and only affect your interface.
                </p>
              </div>
            </>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={onNewTask}
            className="btn btn-ghost hidden sm:flex"
            aria-label="New task"
          >
            <Plus size={14} aria-hidden />
            <span className="hidden md:inline">New task</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleEdit}
          aria-pressed={editMode}
          className={`btn ${editMode ? "btn-secondary border-[#8b7cf8]/50 text-[#c4baff]" : "btn-ghost"}`}
        >
          <PencilRuler size={14} aria-hidden />
          <span className="hidden md:inline">{editMode ? "Editing" : "Customize"}</span>
        </button>

        <button
          type="button"
          onClick={onToggleAi}
          aria-pressed={aiOpen}
          aria-label="Toggle interface assistant"
          className={`btn ${aiOpen ? "btn-secondary" : "btn-ghost"}`}
        >
          <Sparkles size={14} aria-hidden />
          <span className="hidden md:inline">Assistant</span>
          <PanelRight size={12} aria-hidden className="hidden md:inline opacity-50" />
        </button>
      </div>
    </header>
  );
}

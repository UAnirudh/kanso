"use client";

import type { CSSProperties } from "react";
import {
  ChevronDown,
  ChevronUp,
  CornerLeftUp,
  CornerRightUp,
  Eye,
  EyeOff,
  Minus,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { InterfaceOperation } from "@/lib/interface/operations";
import { CATALOG } from "@/lib/interface/catalog";
import type { InterfaceDocument, InterfaceNode } from "@/lib/interface/types";
import { REGISTRY } from "./registry";

export interface SurfaceDiff {
  added: Set<string>;
  changed: Set<string>;
}

export function Surface({
  document,
  pageKey,
  editMode,
  busy,
  diff,
  onOperate,
  onSettings,
  onRequestEdit,
}: {
  document: InterfaceDocument;
  pageKey: string;
  editMode: boolean;
  busy: boolean;
  diff: SurfaceDiff | null;
  onOperate: (operations: InterfaceOperation[], label: string) => void;
  onSettings: (node: InterfaceNode) => void;
  onRequestEdit: () => void;
}) {
  const page = document.pages[pageKey];
  if (!page) {
    return (
      <div className="rounded-[12px] border border-dashed border-[var(--s-border)] p-10 text-center text-[13px] text-[var(--s-muted)]">
        This page has no interface yet.
      </div>
    );
  }

  const nodes = editMode ? page.components : page.components.filter((node) => node.visible);

  if (nodes.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-[var(--s-border)] p-10 text-center">
        <p className="text-[13px] text-[var(--s-muted)]">Every component on this page is hidden.</p>
        <button type="button" className="s-btn mt-3" onClick={onRequestEdit}>
          Show and rearrange components
        </button>
      </div>
    );
  }

  return (
    <div className="surface-grid">
      {nodes.map((node, index) => {
        const definition = CATALOG[node.type];
        const View = REGISTRY[node.type];
        const isNew = diff?.added.has(node.id) ?? false;
        const isChanged = diff?.changed.has(node.id) ?? false;
        const style = {
          "--span": String(node.layout.span),
          "--span-md": String(Math.min(node.layout.span, 6)),
        } as CSSProperties;

        return (
          <div
            key={node.id}
            className={`surface-node group relative ${
              editMode
                ? "rounded-[12px] border border-dashed border-[#8b7cf8]/35 bg-[#8b7cf8]/[0.03] p-1.5"
                : ""
            }`}
            style={style}
            data-node-id={node.id}
            data-node-type={node.type}
          >
            {editMode && (
              <div
                role="toolbar"
                aria-label={`Arrange ${node.title || definition.label}`}
                className="mb-1.5 flex flex-wrap items-center gap-0.5 rounded-[6px] border border-[#262a32] bg-[#0d0f13] px-1 py-0.5"
              >
                <span className="min-w-0 max-w-[160px] truncate px-1 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-[#82858f]">
                  {definition.label}
                </span>
                <span className="mr-1 shrink-0 text-[9px] text-[#4f525b]">
                  {node.layout.span}/12
                </span>
                <ToolbarButton
                  label="Move earlier"
                  disabled={busy || index === 0}
                  onClick={() =>
                    onOperate(
                      [{ op: "moveComponent", page: pageKey, id: node.id, index: index - 1 }],
                      "Reordered components",
                    )
                  }
                >
                  <ChevronUp size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Move later"
                  disabled={busy || index === nodes.length - 1}
                  onClick={() =>
                    onOperate(
                      [{ op: "moveComponent", page: pageKey, id: node.id, index: index + 1 }],
                      "Reordered components",
                    )
                  }
                >
                  <ChevronDown size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Make narrower"
                  disabled={busy || node.layout.span <= definition.minSpan}
                  onClick={() =>
                    onOperate(
                      [
                        {
                          op: "moveComponent",
                          page: pageKey,
                          id: node.id,
                          span: Math.max(definition.minSpan, node.layout.span - 3),
                        },
                      ],
                      "Resized component",
                    )
                  }
                >
                  <Minus size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Make wider"
                  disabled={busy || node.layout.span >= definition.maxSpan}
                  onClick={() =>
                    onOperate(
                      [
                        {
                          op: "moveComponent",
                          page: pageKey,
                          id: node.id,
                          span: Math.min(definition.maxSpan, node.layout.span + 3),
                        },
                      ],
                      "Resized component",
                    )
                  }
                >
                  <Plus size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Move to the left edge"
                  disabled={busy || node.layout.column === 1}
                  onClick={() =>
                    onOperate(
                      [{ op: "moveComponent", page: pageKey, id: node.id, column: 1 }],
                      "Moved component left",
                    )
                  }
                >
                  <CornerLeftUp size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Move to the right edge"
                  disabled={busy}
                  onClick={() =>
                    onOperate(
                      [{ op: "moveComponent", page: pageKey, id: node.id, column: 9 }],
                      "Moved component right",
                    )
                  }
                >
                  <CornerRightUp size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label={node.visible ? "Hide component" : "Show component"}
                  disabled={busy}
                  onClick={() =>
                    onOperate(
                      [
                        {
                          op: "setVisible",
                          page: pageKey,
                          id: node.id,
                          visible: !node.visible,
                        },
                      ],
                      node.visible ? "Hid a component" : "Showed a component",
                    )
                  }
                >
                  {node.visible ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                </ToolbarButton>
                <ToolbarButton
                  label="Component settings"
                  disabled={busy}
                  onClick={() => onSettings(node)}
                >
                  <SlidersHorizontal size={12} aria-hidden />
                </ToolbarButton>
                <ToolbarButton
                  label="Remove component"
                  disabled={busy || nodes.length <= 1}
                  danger
                  onClick={() =>
                    onOperate(
                      [{ op: "removeComponent", page: pageKey, id: node.id }],
                      "Removed component",
                    )
                  }
                >
                  <Trash2 size={12} aria-hidden />
                </ToolbarButton>
                {!node.visible && (
                  <span className="ml-auto rounded-[3px] bg-[#8b7cf8]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#c4baff]">
                    Hidden
                  </span>
                )}
              </div>
            )}

            <div
              className={`h-full rounded-[var(--s-radius)] transition-shadow ${
                isNew
                  ? "ring-2 ring-[#8b7cf8] ring-offset-2 ring-offset-[var(--s-bg)]"
                  : isChanged
                    ? "ring-1 ring-[#8b7cf8]/70 ring-offset-2 ring-offset-[var(--s-bg)]"
                    : ""
              } ${!node.visible ? "opacity-45 saturate-50" : ""}`}
            >
              <View node={node} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`tap-target grid h-7 w-7 shrink-0 place-items-center rounded-[4px] transition-colors disabled:opacity-30 ${
        danger
          ? "text-[#82858f] hover:bg-red-500/15 hover:text-red-300"
          : "text-[#82858f] hover:bg-[#1b1e24] hover:text-[#e8e9ee]"
      }`}
    >
      {children}
    </button>
  );
}

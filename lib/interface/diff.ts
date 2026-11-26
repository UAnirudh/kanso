import { CATALOG } from "./catalog";
import type { InterfaceDocument, InterfaceNode, Props } from "./types";

/**
 * Compares the document a proposal was built from with the document it would
 * produce, and states the change in the user's terms: what was added, removed,
 * moved or resized, and which settings differ. The assistant preview shows this
 * list so a proposal can be reviewed without switching to the canvas.
 *
 * Pure data in, plain entries out. It runs on the client: no database access and
 * no model output is ever turned into markup.
 */

export type InterfaceDiffTone = "added" | "removed" | "changed";

export type InterfaceDiffArea =
  | "theme"
  | "accent"
  | "density"
  | "navigation"
  | "home"
  | "page"
  | "component";

export interface InterfaceDiffEntry {
  /** Stable key for rendering; no two entries share one. */
  id: string;
  area: InterfaceDiffArea;
  tone: InterfaceDiffTone;
  /** Page key this entry belongs to, or null for document-level settings. */
  page: string | null;
  /** One reviewable sentence, e.g. `Added Progress chart “Progress” to Overview`. */
  text: string;
}

export interface InterfaceDiffOptions {
  /** Page keys → titles, so entries say “Overview” instead of `overview`. */
  pageTitles?: Record<string, string>;
  /** Keep at most this many entries. The caller is expected to show the total. */
  limit?: number;
}

function pageLabel(key: string, pageTitles?: Record<string, string>): string {
  return pageTitles?.[key] ?? key;
}

/** Component titles can be blank (FilterBar); fall back to the catalog label. */
function nodeLabel(node: InterfaceNode): string {
  return node.title.trim() || CATALOG[node.type].label;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function changedProps(before: Props, after: Props): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !sameValue(before[key], after[key])).sort();
}

function sameSequence(a: InterfaceNode[], b: InterfaceNode[]): boolean {
  return a.length === b.length && a.every((node, index) => node.id === b[index]!.id);
}

export function diffInterfaces(
  base: InterfaceDocument,
  next: InterfaceDocument,
  options: InterfaceDiffOptions = {},
): InterfaceDiffEntry[] {
  const titles = options.pageTitles;
  const entries: InterfaceDiffEntry[] = [];
  let sequence = 0;

  const add = (
    area: InterfaceDiffArea,
    tone: InterfaceDiffTone,
    page: string | null,
    text: string,
  ) => {
    sequence += 1;
    entries.push({ id: `${area}:${page ?? "document"}:${sequence}`, area, tone, page, text });
  };

  if (base.theme !== next.theme) {
    add("theme", "changed", null, `Theme: ${base.theme} → ${next.theme}`);
  }
  if (base.accent !== next.accent) {
    add("accent", "changed", null, `Accent: ${base.accent} → ${next.accent}`);
  }
  if (base.density !== next.density) {
    add("density", "changed", null, `Density: ${base.density} → ${next.density}`);
  }
  if (base.nav.collapsed !== next.nav.collapsed) {
    add(
      "navigation",
      "changed",
      null,
      next.nav.collapsed ? "Collapsed the navigation" : "Expanded the navigation",
    );
  }
  if (base.nav.width !== next.nav.width) {
    add("navigation", "changed", null, `Navigation width: ${base.nav.width} → ${next.nav.width}`);
  }
  if (base.homePage !== next.homePage) {
    add(
      "home",
      "changed",
      null,
      `Home page: ${pageLabel(base.homePage, titles)} → ${pageLabel(next.homePage, titles)}`,
    );
  }

  // Pages the proposal keeps or adds come first, in their new order; pages it
  // removes follow, so every removal is still reported.
  const pageKeys = [
    ...Object.keys(next.pages),
    ...Object.keys(base.pages).filter((key) => !(key in next.pages)),
  ];

  for (const key of pageKeys) {
    const before = base.pages[key];
    const after = next.pages[key];
    const label = pageLabel(key, titles);

    if (!before && after) {
      const count = after.components.length;
      add(
        "page",
        "added",
        key,
        count === 0
          ? `Added page “${label}”`
          : `Added page “${label}” with ${count} component${count === 1 ? "" : "s"}`,
      );
      continue;
    }
    if (before && !after) {
      add("page", "removed", key, `Removed page “${label}”`);
      continue;
    }
    if (!before || !after) continue;

    if (before.layout !== after.layout) {
      add("page", "changed", key, `Page “${label}” layout: ${before.layout} → ${after.layout}`);
    }

    const previous = new Map(before.components.map((node) => [node.id, node]));

    for (const node of after.components) {
      const old = previous.get(node.id);
      const name = nodeLabel(node);

      if (!old) {
        add(
          "component",
          "added",
          key,
          `Added ${CATALOG[node.type].label} “${name}” to ${label}`,
        );
        continue;
      }

      if (old.type !== node.type) {
        add(
          "component",
          "changed",
          key,
          `Replaced ${CATALOG[old.type].label} “${nodeLabel(old)}” with ${CATALOG[node.type].label} “${name}” on ${label}`,
        );
      }
      if (old.title !== node.title) {
        add("component", "changed", key, `Renamed “${nodeLabel(old)}” to “${name}” on ${label}`);
      }
      if (old.visible !== node.visible) {
        add(
          "component",
          "changed",
          key,
          node.visible ? `Showed “${name}” on ${label}` : `Hid “${name}” on ${label}`,
        );
      }
      if (old.layout.column !== node.layout.column) {
        add("component", "changed", key, `Moved “${name}” to column ${node.layout.column} on ${label}`);
      }
      if (old.layout.span !== node.layout.span) {
        add(
          "component",
          "changed",
          key,
          `Resized “${name}” to ${node.layout.span} columns on ${label}`,
        );
      }
      if (old.dataSource !== node.dataSource) {
        add(
          "component",
          "changed",
          key,
          node.dataSource
            ? `Bound “${name}” to ${node.dataSource} on ${label}`
            : `Unbound “${name}” on ${label}`,
        );
      }

      const props = changedProps(old.props, node.props);
      if (props.length > 0) {
        const setting =
          props.length <= 2 ? props.join(" and ") : `${props.length} settings`;
        add("component", "changed", key, `Changed ${setting} on “${name}”`);
      }
    }

    const nextIds = new Set(after.components.map((node) => node.id));
    for (const node of before.components) {
      if (!nextIds.has(node.id)) {
        add("component", "removed", key, `Removed “${nodeLabel(node)}” from ${label}`);
      }
    }

    // Additions and removals already read as such; this only reports a pure
    // reorder, when the same components survive in a different order.
    const survivingBefore = before.components.filter((node) => nextIds.has(node.id));
    const survivingAfter = after.components.filter((node) => previous.has(node.id));
    if (survivingBefore.length > 1 && !sameSequence(survivingBefore, survivingAfter)) {
      add("component", "changed", key, `Reordered components on ${label}`);
    }
  }

  return options.limit ? entries.slice(0, options.limit) : entries;
}

import { describe, expect, it } from "vitest";
import { diffInterfaces } from "@/lib/interface/diff";
import type { InterfaceDocument, InterfaceNode, PageSurface } from "@/lib/interface/types";

const titles = {
  overview: "Overview",
  board: "Board",
  notes: "Notes",
  analytics: "Analytics",
};

function page(
  pageId: string,
  components: InterfaceNode[],
  layout: "grid" | "stack" = "grid",
): PageSurface {
  return { pageId, layout, components };
}

function node(overrides: Partial<InterfaceNode> & Pick<InterfaceNode, "id" | "type">): InterfaceNode {
  return {
    title: "Node",
    visible: true,
    props: {},
    layout: { column: 1, span: 6 },
    dataSource: null,
    ...overrides,
  };
}

function document(overrides: Partial<InterfaceDocument> = {}): InterfaceDocument {
  return {
    schemaVersion: 1,
    theme: "light",
    accent: "indigo",
    density: "comfortable",
    nav: { collapsed: false, width: "default" },
    homePage: "overview",
    pages: { overview: page("overview", []) },
    ...overrides,
  };
}

function texts(entries: ReturnType<typeof diffInterfaces>): string[] {
  return entries.map((entry) => entry.text);
}

describe("diffInterfaces", () => {
  it("reports document settings, navigation and the home page", () => {
    const before = document();
    const after = document({
      theme: "dark",
      accent: "teal",
      density: "compact",
      nav: { collapsed: true, width: "compact" },
      homePage: "board",
      pages: { overview: page("overview", []), board: page("board", []) },
    });

    expect(texts(diffInterfaces(before, after, { pageTitles: titles }))).toEqual([
      "Theme: light → dark",
      "Accent: indigo → teal",
      "Density: comfortable → compact",
      "Collapsed the navigation",
      "Navigation width: default → compact",
      "Home page: Overview → Board",
      "Added page “Board”",
    ]);
  });

  it("names every component-level change on a page", () => {
    const before = document({
      pages: {
        overview: page("overview", [
          node({
            id: "cmp_tasks",
            type: "TaskList",
            title: "Tasks",
            layout: { column: 1, span: 6 },
            props: { limit: 10, showCompleted: true },
          }),
          node({
            id: "cmp_calendar",
            type: "Calendar",
            title: "Schedule",
            layout: { column: 7, span: 6 },
            props: { monthOffset: 0 },
          }),
        ]),
      },
    });
    const after = document({
      pages: {
        overview: page("overview", [
          node({
            id: "cmp_tasks",
            type: "TaskList",
            title: "My tasks",
            visible: false,
            layout: { column: 7, span: 6 },
            props: { limit: 12, showCompleted: false },
          }),
          node({
            id: "cmp_chart",
            type: "ProgressChart",
            title: "Progress",
            layout: { column: 1, span: 4 },
            props: { metric: "weekly-completions" },
          }),
        ]),
      },
    });

    const entries = texts(diffInterfaces(before, after, { pageTitles: titles }));
    expect(entries).toContain("Renamed “Tasks” to “My tasks” on Overview");
    expect(entries).toContain("Hid “My tasks” on Overview");
    expect(entries).toContain("Moved “My tasks” to column 7 on Overview");
    expect(entries).toContain("Changed limit and showCompleted on “My tasks”");
    expect(entries).toContain("Added Progress chart “Progress” to Overview");
    expect(entries).toContain("Removed “Schedule” from Overview");
  });

  it("reports a resize separately from a move", () => {
    const before = document({
      pages: {
        overview: page("overview", [
          node({ id: "cmp_chart", type: "ProgressChart", title: "Chart", layout: { column: 1, span: 4 } }),
        ]),
      },
    });
    const after = document({
      pages: {
        overview: page("overview", [
          node({ id: "cmp_chart", type: "ProgressChart", title: "Chart", layout: { column: 1, span: 8 } }),
        ]),
      },
    });

    expect(texts(diffInterfaces(before, after, { pageTitles: titles }))).toEqual([
      "Resized “Chart” to 8 columns on Overview",
    ]);
  });

  it("reports page additions, removals and layout changes", () => {
    const before = document({
      pages: {
        overview: page("overview", []),
        notes: page("notes", []),
      },
    });
    const after = document({
      pages: {
        overview: page("overview", [], "stack"),
        analytics: page("analytics", [
          node({ id: "cmp_chart", type: "ProgressChart", title: "Chart" }),
        ]),
      },
    });

    const entries = texts(diffInterfaces(before, after, { pageTitles: titles }));
    expect(entries).toContain("Page “Overview” layout: grid → stack");
    expect(entries).toContain("Added page “Analytics” with 1 component");
    expect(entries).toContain("Removed page “Notes”");
  });

  it("reports a pure reorder and nothing else", () => {
    const first = node({ id: "cmp_a", type: "TaskList", title: "Tasks" });
    const second = node({ id: "cmp_b", type: "NotesPanel", title: "Notes" });
    const before = document({ pages: { overview: page("overview", [first, second]) } });
    const after = document({ pages: { overview: page("overview", [second, first]) } });

    expect(texts(diffInterfaces(before, after, { pageTitles: titles }))).toEqual([
      "Reordered components on Overview",
    ]);
  });

  it("returns nothing when the documents are identical", () => {
    const before = document({
      pages: {
        overview: page("overview", [
          node({ id: "cmp_tasks", type: "TaskList", title: "Tasks", props: { limit: 10 } }),
        ]),
      },
    });

    expect(diffInterfaces(before, structuredClone(before))).toEqual([]);
  });

  it("caps the list when a limit is given", () => {
    const before = document();
    const after = document({
      theme: "dark",
      accent: "rose",
      density: "compact",
      nav: { collapsed: true, width: "default" },
    });

    const entries = diffInterfaces(before, after, { limit: 2 });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.text).toBe("Theme: light → dark");
    expect(entries[0]!.id).not.toBe(entries[1]!.id);
  });
});

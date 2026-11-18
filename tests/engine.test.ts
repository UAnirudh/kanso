import { describe, expect, it } from "vitest";
import {
  InterfaceValidationError,
  applyOperations,
  normalizeDocument,
  packLayouts,
} from "@/lib/interface/engine";
import { buildDocumentFromTemplate, PROJECT_TEMPLATE } from "@/lib/interface/templates";
import type { InterfaceDocument, InterfaceNode } from "@/lib/interface/types";
import type { InterfaceOperation } from "@/lib/interface/operations";

const PAGE_KEYS = PROJECT_TEMPLATE.pages.map((page) => page.key);

function makeIdFactory() {
  let counter = 0;
  return () => `cmp_test_${(counter += 1)}`;
}

function baseDocument(): InterfaceDocument {
  return buildDocumentFromTemplate(PROJECT_TEMPLATE, {
    idFactory: makeIdFactory(),
    theme: "light",
  });
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

describe("normalizeDocument", () => {
  it("accepts a freshly generated template without warnings", () => {
    const result = normalizeDocument(baseDocument(), { pageKeys: PAGE_KEYS });
    expect(result.warnings).toEqual([]);
    expect(Object.keys(result.document.pages)).toEqual(PAGE_KEYS);
  });

  it("drops unknown component types and keeps the page usable", () => {
    const document = baseDocument();
    document.pages.overview!.components = [
      node({ id: "cmp_a", type: "TaskBoard" }),
      { ...node({ id: "cmp_b", type: "TaskList" }), type: "Hologram" as never },
    ];
    const result = normalizeDocument(document, { pageKeys: PAGE_KEYS });
    const types = result.document.pages.overview!.components.map((component) => component.type);
    expect(types).toEqual(["TaskBoard"]);
    expect(result.warnings.some((warning) => warning.includes("Hologram"))).toBe(true);
  });

  it("clamps spans into each component's allowed range", () => {
    const document = baseDocument();
    document.pages.overview!.components = [
      node({ id: "cmp_a", type: "ProgressChart", layout: { column: 1, span: 12 } }),
      node({ id: "cmp_b", type: "ProgressChart", layout: { column: 1, span: 1 } }),
    ];
    const result = normalizeDocument(document, { pageKeys: PAGE_KEYS });
    expect(result.document.pages.overview!.components[0]!.layout.span).toBe(12);
    expect(result.document.pages.overview!.components[1]!.layout.span).toBe(3);
  });

  it("never leaves a page with everything hidden", () => {
    const document = baseDocument();
    document.pages.overview!.components = [
      node({ id: "cmp_a", type: "TaskList", visible: false }),
    ];
    const result = normalizeDocument(document, { pageKeys: PAGE_KEYS });
    expect(result.document.pages.overview!.components[0]!.visible).toBe(true);
  });

  it("fills in a page that is missing from a stored document", () => {
    const document = baseDocument();
    delete document.pages.analytics;
    const result = normalizeDocument(document, { pageKeys: PAGE_KEYS });
    expect(result.document.pages.analytics).toBeDefined();
    expect(result.warnings.some((warning) => warning.includes("analytics"))).toBe(true);
  });

  it("migrates a legacy document onto the current schema version", () => {
    const legacy = baseDocument() as unknown as Record<string, unknown>;
    delete legacy.schemaVersion;
    legacy.theme = "system";
    legacy.accent = "purple";
    legacy.nav = { collapsed: "yes", width: "huge" };

    const result = normalizeDocument(legacy as unknown as InterfaceDocument, {
      pageKeys: PAGE_KEYS,
    });
    expect(result.document.schemaVersion).toBe(1);
    expect(result.document.theme).toBe("light");
    expect(result.document.accent).toBe("indigo");
    expect(result.document.nav).toEqual({ collapsed: true, width: "default" });
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("drops interface data for pages that no longer exist", () => {
    const document = baseDocument();
    document.pages.ghost = document.pages.overview!;
    const result = normalizeDocument(document, { pageKeys: PAGE_KEYS });
    expect(result.document.pages.ghost).toBeUndefined();
  });
});

describe("packLayouts", () => {
  const page = (nodes: InterfaceNode[]) => ({
    pageId: "p",
    layout: "grid" as const,
    components: nodes,
  });

  it("fills a row before starting a new one", () => {
    const surface = page([
      node({ id: "a", type: "StatSummary", layout: { column: 1, span: 4 } }),
      node({ id: "b", type: "StatSummary", layout: { column: 1, span: 4 } }),
      node({ id: "c", type: "StatSummary", layout: { column: 1, span: 4 } }),
      node({ id: "d", type: "StatSummary", layout: { column: 1, span: 4 } }),
    ]);
    packLayouts(surface);
    expect(surface.components.map((component) => component.layout.column)).toEqual([1, 5, 9, 1]);
  });

  it("honours a requested column when the slot is free", () => {
    const surface = page([
      node({ id: "a", type: "ProgressChart", layout: { column: 9, span: 4 } }),
      node({ id: "b", type: "ProgressChart", layout: { column: 1, span: 4 } }),
    ]);
    packLayouts(surface);
    expect(surface.components.map((component) => component.layout.column)).toEqual([9, 1]);
  });

  it("stacks everything full width in stack layout", () => {
    const surface = page([
      node({ id: "a", type: "TaskList", layout: { column: 5, span: 4 } }),
      node({ id: "b", type: "Calendar", layout: { column: 9, span: 4 } }),
    ]);
    surface.layout = "stack";
    packLayouts(surface);
    expect(surface.components.every((component) => component.layout.span === 12)).toBe(true);
    expect(surface.components.every((component) => component.layout.column === 1)).toBe(true);
  });
});

describe("applyOperations", () => {
  const context = { pageKeys: PAGE_KEYS };
  const apply = (operations: InterfaceOperation[], document = baseDocument()) =>
    applyOperations(document, operations, context);

  it("adds a component with validated props and a generated id", () => {
    const result = apply([
      {
        op: "addComponent",
        page: "analytics",
        type: "ProgressChart",
        props: { metric: "status-breakdown", weeks: 12, variant: "line" },
        span: 4,
        column: 9,
      },
    ]);
    const components = result.document.pages.analytics!.components;
    const added = components[components.length - 1]!;
    expect(added.type).toBe("ProgressChart");
    expect(added.props.metric).toBe("status-breakdown");
    expect(added.layout).toEqual({ column: 9, span: 4 });
    expect(result.warnings).toEqual([]);
  });

  it("rejects unknown pages, unknown ids and empty pages", () => {
    expect(() => apply([{ op: "addComponent", page: "nope", type: "TaskList" }])).toThrow(
      InterfaceValidationError,
    );
    expect(() =>
      apply([{ op: "setVisible", page: "overview", id: "cmp_missing", visible: false }]),
    ).toThrow(/No component/);

    const document = baseDocument();
    document.pages.board!.components = [document.pages.board!.components[0]!];
    expect(() =>
      applyOperations(
        document,
        [
          {
            op: "removeComponent",
            page: "board",
            id: document.pages.board!.components[0]!.id,
          },
        ],
        context,
      ),
    ).toThrow(/cannot be left empty/);
  });

  it("strips unsupported props but keeps valid ones", () => {
    const document = baseDocument();
    const boardNode = document.pages.board!.components.find(
      (component) => component.type === "TaskBoard",
    )!;
    const result = applyOperations(
      document,
      [
        {
          op: "updateProps",
          page: "board",
          id: boardNode.id,
          props: { showCompleted: false, hideEverything: true },
        },
      ],
      context,
    );
    const updated = result.document.pages.board!.components.find(
      (component) => component.id === boardNode.id,
    )!;
    expect(updated.props.showCompleted).toBe(false);
    expect(updated.props.hideEverything).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes("hideEverything"))).toBe(true);
  });

  it("refuses to bind a component to an unsupported data source", () => {
    const document = baseDocument();
    const notes = document.pages.overview!.components.find(
      (component) => component.type === "NotesPanel",
    )!;
    const result = applyOperations(
      document,
      [{ op: "setDataSource", page: "overview", id: notes.id, dataSource: "tasks" }],
      context,
    );
    const updated = result.document.pages.overview!.components.find(
      (component) => component.id === notes.id,
    )!;
    expect(updated.dataSource).toBe("notes");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("applies document-level presentation operations", () => {
    const result = apply([
      { op: "setTheme", theme: "dark" },
      { op: "setAccent", accent: "teal" },
      { op: "setDensity", density: "compact" },
      { op: "setNavCollapsed", collapsed: true },
    ]);
    expect(result.document.theme).toBe("dark");
    expect(result.document.accent).toBe("teal");
    expect(result.document.density).toBe("compact");
    expect(result.document.nav.collapsed).toBe(true);
  });

  it("is atomic: one bad step leaves the document untouched", () => {
    const document = baseDocument();
    const snapshot = JSON.stringify(document);
    expect(() =>
      applyOperations(
        document,
        [
          { op: "setTheme", theme: "dark" },
          { op: "moveComponent", page: "overview", id: "missing", column: 9 },
        ],
        context,
      ),
    ).toThrow();
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it("rejects noisy proposals above the operation budget", () => {
    const operations: InterfaceOperation[] = Array.from({ length: 9 }, () => ({
      op: "setTheme",
      theme: "dark",
    }));
    expect(() => apply(operations)).toThrow(/Too many operations/);
  });

  it("keeps every visible node inside the 12 column grid", () => {
    const result = apply([
      { op: "addComponent", page: "overview", type: "TaskList", span: 8, column: 9 },
      { op: "addComponent", page: "overview", type: "NotesPanel", span: 3, column: 1 },
    ]);
    for (const component of result.document.pages.overview!.components) {
      expect(component.layout.column).toBeGreaterThanOrEqual(1);
      expect(component.layout.column + component.layout.span - 1).toBeLessThanOrEqual(12);
    }
  });
});

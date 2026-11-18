import { describe, expect, it } from "vitest";
import { taskCreateSchema, taskUpdateSchema } from "@/lib/repo/records";
import { operationSchema } from "@/lib/interface/operations";
import { CATALOG_LIST } from "@/lib/interface/catalog";
import { normalizeProps } from "@/lib/interface/catalog";

describe("task input validation", () => {
  it("applies sensible defaults", () => {
    const parsed = taskCreateSchema.parse({ title: "  Ship it  " });
    expect(parsed).toMatchObject({
      title: "Ship it",
      status: "todo",
      priority: "medium",
      dueDate: null,
      description: "",
    });
  });

  it("rejects empty titles and malformed dates", () => {
    expect(taskCreateSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: "ok", dueDate: "2026/01/02" }).success).toBe(false);
  });

  it("only accepts defined statuses and priorities", () => {
    expect(taskUpdateSchema.safeParse({ status: "blocked" }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ priority: "critical" }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ status: "done", priority: "urgent" }).success).toBe(true);
  });
});

describe("operation schema", () => {
  it("rejects operations that are not in the allowlist", () => {
    expect(operationSchema.safeParse({ op: "evalJs", code: "alert(1)" }).success).toBe(false);
    expect(operationSchema.safeParse({ op: "addComponent", page: "overview", type: "Iframe" }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range layout values", () => {
    expect(
      operationSchema.safeParse({
        op: "moveComponent",
        page: "overview",
        id: "cmp_1",
        span: 14,
      }).success,
    ).toBe(false);
  });

  it("accepts the full supported vocabulary", () => {
    const operations = [
      { op: "addComponent", page: "overview", type: "TaskBoard" },
      { op: "removeComponent", page: "overview", id: "cmp_1" },
      { op: "updateProps", page: "overview", id: "cmp_1", props: { showCompleted: false } },
      { op: "moveComponent", page: "overview", id: "cmp_1", column: 9, span: 4, index: 0 },
      { op: "setVisible", page: "overview", id: "cmp_1", visible: false },
      { op: "renameComponent", page: "overview", id: "cmp_1", title: "Sprint" },
      { op: "reorderComponents", page: "overview", ids: ["cmp_1"] },
      { op: "setTheme", theme: "dark" },
      { op: "setAccent", accent: "rose" },
      { op: "setDensity", density: "compact" },
      { op: "setNavCollapsed", collapsed: true },
      { op: "setNavWidth", width: "compact" },
      { op: "setPageLayout", page: "overview", layout: "stack" },
      { op: "setDataSource", page: "overview", id: "cmp_1", dataSource: "tasks" },
    ];
    for (const operation of operations) {
      expect(operationSchema.safeParse(operation).success).toBe(true);
    }
  });
});

describe("component catalogue", () => {
  it("gives every component typed defaults that satisfy its own schema", () => {
    for (const definition of CATALOG_LIST) {
      const normalized = normalizeProps(definition.type, definition.defaultProps);
      expect(normalized.warnings).toEqual([]);
      expect(normalized.props).toEqual(definition.defaultProps);
    }
  });

  it("has unique labels and sane span limits", () => {
    const labels = CATALOG_LIST.map((definition) => definition.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const definition of CATALOG_LIST) {
      expect(definition.minSpan).toBeGreaterThanOrEqual(1);
      expect(definition.maxSpan).toBeLessThanOrEqual(12);
      expect(definition.minSpan).toBeLessThanOrEqual(definition.defaultSpan);
      expect(definition.defaultSpan).toBeLessThanOrEqual(definition.maxSpan);
      expect(definition.a11y.length).toBeGreaterThan(10);
    }
  });
});

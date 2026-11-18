import { describe, expect, it } from "vitest";
import { LocalPlannerError, planLocally } from "@/lib/ai/local-planner";
import { applyOperations } from "@/lib/interface/engine";
import { buildDocumentFromTemplate, PROJECT_TEMPLATE } from "@/lib/interface/templates";
import type { InterfaceDocument } from "@/lib/interface/types";

const PAGE_KEYS = PROJECT_TEMPLATE.pages.map((page) => page.key);

function baseDocument(): InterfaceDocument {
  let counter = 0;
  return buildDocumentFromTemplate(PROJECT_TEMPLATE, {
    idFactory: () => `cmp_plan_${(counter += 1)}`,
    theme: "light",
  });
}

describe("local planner", () => {
  it("handles the acceptance request end to end", () => {
    const document = baseDocument();
    const plan = planLocally({
      prompt:
        "Move my tasks to the left, add a progress chart on the right, and switch to dark mode.",
      document,
    });

    expect(plan.operations).toContainEqual({ op: "setTheme", theme: "dark" });
    const added = plan.operations.find(
      (operation) => operation.op === "addComponent" && operation.type === "ProgressChart",
    );
    expect(added).toMatchObject({ op: "addComponent", page: "overview", column: 9, span: 4 });

    const moved = plan.operations.find((operation) => operation.op === "moveComponent");
    expect(moved).toMatchObject({ page: "overview", column: 1 });

    const result = applyOperations(document, plan.operations, { pageKeys: PAGE_KEYS });
    expect(result.document.theme).toBe("dark");
    const overview = result.document.pages.overview!;
    const board = overview.components.find((component) => component.type === "TaskBoard")!;
    const chart = overview.components.find((component) => component.type === "ProgressChart")!;
    expect(board.layout).toMatchObject({ column: 1, span: 8 });
    expect(chart.layout.column + chart.layout.span - 1).toBe(12);
    expect(chart.layout.span).toBe(4);
  });

  it("switches theme and hides completed work", () => {
    const document = baseDocument();
    const plan = planLocally({
      prompt: "Use a cleaner light theme and hide completed tasks",
      document,
    });
    const result = applyOperations(document, plan.operations, { pageKeys: PAGE_KEYS });
    expect(result.document.theme).toBe("light");
    const taskViews = Object.values(result.document.pages)
      .flatMap((page) => page.components)
      .filter((node) =>
        ["TaskBoard", "TaskList", "TaskTable", "Calendar"].includes(node.type),
      );
    expect(taskViews.length).toBeGreaterThan(0);
    expect(taskViews.every((node) => node.props.showCompleted === false)).toBe(true);
  });

  it("makes the interface phone-friendly with a stacked layout", () => {
    const document = baseDocument();
    const plan = planLocally({ prompt: "Make this interface better for mobile", document });
    const result = applyOperations(document, plan.operations, { pageKeys: PAGE_KEYS });
    expect(Object.values(result.document.pages).every((page) => page.layout === "stack")).toBe(
      true,
    );
    expect(result.document.nav.collapsed).toBe(true);
  });

  it("collapses and narrows navigation", () => {
    const document = baseDocument();
    const plan = planLocally({ prompt: "Make the navigation smaller and more minimal", document });
    const result = applyOperations(document, plan.operations, { pageKeys: PAGE_KEYS });
    expect(result.document.nav.collapsed).toBe(true);
    expect(result.document.nav.width).toBe("compact");
  });

  it("swaps a table for a chart", () => {
    const document = baseDocument();
    const plan = planLocally({ prompt: "Replace the task table with a chart", document });
    const result = applyOperations(document, plan.operations, { pageKeys: PAGE_KEYS });
    const analytics = result.document.pages.analytics!;
    expect(analytics.components.some((node) => node.type === "TaskTable")).toBe(false);
    expect(analytics.components.some((node) => node.type === "ProgressChart")).toBe(true);
  });

  it("refuses vague requests with actionable hints instead of guessing", () => {
    const document = baseDocument();
    try {
      planLocally({ prompt: "Make it better", document });
      throw new Error("expected the planner to refuse");
    } catch (error) {
      expect(error).toBeInstanceOf(LocalPlannerError);
      expect((error as LocalPlannerError).hints.length).toBeGreaterThan(2);
    }
  });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * T-012: the accessibility gate.
 *
 * The design tokens and the canvas are hand-built (ADR-6, ADR-8), so there is no
 * component library's a11y baseline to inherit. This spec runs axe against the
 * three surfaces a guest actually sees — the dashboard, the account page and a
 * generated workspace — and fails on serious or critical WCAG A/AA violations.
 *
 * The generated page is produced by the local planner (no key in CI), the same
 * document the acceptance spec applies, so the scan covers the real canvas,
 * registry components and assistant panel rather than a fixture.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

async function audit(page: Page, surface: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ""),
  );

  expect(
    blocking.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`,
    ),
    `${surface} has serious or critical axe violations`,
  ).toEqual([]);
}

test("dashboard and account page meet WCAG A/AA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("guest-name").first()).toBeVisible();
  await audit(page, "dashboard");

  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { level: 1, name: /Keep your interface on every device/ }),
  ).toBeVisible();
  await audit(page, "account page");
});

test("a generated workspace meets WCAG A/AA", async ({ page }) => {
  await page.goto("/");
  await page.fill(
    "#app-prompt",
    "Create a project management application with team workspaces, a kanban board, a calendar and delivery analytics",
  );
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/app_/, { timeout: 40_000 });
  await expect(page.locator('[data-node-type="TaskBoard"]')).toBeVisible();

  await audit(page, "generated workspace");
});

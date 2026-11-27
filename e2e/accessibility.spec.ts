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
 *
 * The chrome is dark by design: `:root` fixes `color-scheme: dark` and its
 * tokens have no light variant, so the dashboard and account page already are
 * the dark chrome. The interface *surface* has two palettes, so every page of
 * the generated project template — Overview, Board, Calendar and Analytics — is
 * scanned in both, switched through the real Appearance control (ADR-14).
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

// Each template page renders a different set of catalog components, so every
// one needs its own pass: the marker proves the page actually mounted before
// axe looks at it.
const PROJECT_PAGES = [
  { title: "Overview", marker: '[data-node-type="TaskBoard"]' },
  { title: "Board", marker: '[data-node-type="TaskBoard"]' },
  { title: "Calendar", marker: '[data-node-type="Calendar"]' },
  { title: "Analytics", marker: '[data-node-type="ProgressChart"]' },
];

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

async function switchTheme(page: Page, theme: "light" | "dark") {
  await page.getByRole("button", { name: "Appearance settings" }).click();
  const option = page.getByRole("button", { name: theme, exact: true });
  await option.click();
  await expect(page.locator(".surface")).toHaveAttribute("data-theme", theme);
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close appearance settings" }).click();
  await expect(option).toHaveCount(0);
}

async function openPage(page: Page, title: string, marker: string) {
  await page
    .getByRole("navigation", { name: "Application pages" })
    .getByRole("button", { name: title, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.locator(marker).first()).toBeVisible();
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

test("every generated workspace page meets WCAG A/AA in both themes", async ({ page }) => {
  await page.goto("/");
  await page.fill(
    "#app-prompt",
    "Create a project management application with team workspaces, a kanban board, a calendar and delivery analytics",
  );
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page).toHaveURL(/\/apps\/app_/, { timeout: 40_000 });
  await expect(page.locator('[data-node-type="TaskBoard"]')).toBeVisible();

  for (const { title, marker } of PROJECT_PAGES) {
    await openPage(page, title, marker);
    await audit(page, `${title} (light)`);
  }

  await switchTheme(page, "dark");

  for (const { title, marker } of PROJECT_PAGES) {
    await openPage(page, title, marker);
    await audit(page, `${title} (dark)`);
  }
});

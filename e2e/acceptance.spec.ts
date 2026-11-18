import { expect, test, type Page } from "@playwright/test";

/**
 * The non-negotiable acceptance scenario, exercised against a real server,
 * a real SQLite database and the real interface pipeline.
 *
 * No GROQ_API_KEY is configured for this run, so the interface assistant uses
 * its deterministic rule planner. The pipeline under test (schema validation,
 * proposal, preview, apply, revision, restore) is identical either way.
 */

const USER_A = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

const USER_B = {
  name: "Grace Hopper",
  email: "grace@example.com",
  password: "compiler-1952-ok",
};

async function signUp(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto("/signup");
  await page.fill("#signup-name", user.name);
  await page.fill("#signup-email", user.email);
  await page.fill("#signup-password", user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill("#login-email", user.email);
  await page.fill("#login-password", user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openApp(page: Page) {
  await page.getByRole("link", { name: /Project workspace/ }).first().click();
  await expect(page).toHaveURL(/\/apps\/app_/);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("per-user adaptive interface, end to end", async ({ browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();

  // 1. Register and sign in.
  await signUp(pageA, USER_A);

  // 2. Generate a project-management application.
  await pageA.fill(
    "#app-prompt",
    "Create a project management application with team workspaces, a kanban board, a calendar and delivery analytics",
  );
  await pageA.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(pageA).toHaveURL(/\/apps\/app_/, { timeout: 40_000 });
  await expect(pageA.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await expect(pageA.locator('[data-node-type="TaskBoard"]')).toBeVisible();

  // 3. Create a task through the real dialog.
  await pageA.getByRole("button", { name: "New task" }).first().click();
  await pageA.fill("#task-title", "Review the launch checklist");
  await pageA.fill("#task-description", "Created by the acceptance test.");
  await pageA.getByRole("button", { name: "Create task" }).click();
  await expect(
    pageA.getByRole("button", { name: "Open Review the launch checklist" }),
  ).toBeVisible();

  // 4. It survives a refresh.
  await pageA.reload();
  await expect(
    pageA.getByRole("button", { name: "Open Review the launch checklist" }),
  ).toBeVisible();

  // 5. Ask for the signature change in plain language.
  const request =
    "Move my tasks to the left, add a progress chart on the right, and switch to dark mode.";
  await pageA.fill("#ai-prompt", request);
  await pageA.press("#ai-prompt", "Enter");

  // 6. A proposal is generated and previewed without saving.
  await expect(pageA.getByText("Proposed change")).toBeVisible({ timeout: 40_000 });
  await expect(pageA.getByText(/Preview ·/)).toBeVisible();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();

  // 7. Apply it.
  await pageA.getByRole("button", { name: "Apply change" }).click();
  await expect(pageA.getByText("Applied to your interface")).toBeVisible();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");

  const boardBox = await pageA.locator('[data-node-type="TaskBoard"]').boundingBox();
  const chartBox = await pageA.locator('[data-node-type="ProgressChart"]').boundingBox();
  expect(boardBox && chartBox).toBeTruthy();
  expect(chartBox!.x).toBeGreaterThan(boardBox!.x + 100);

  // 8. Survives a refresh and a brand new login session.
  await pageA.reload();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();

  await pageA.getByRole("button", { name: "Sign out" }).click();
  await expect(pageA).toHaveURL(/\/login/);
  await signIn(pageA, USER_A);
  await openApp(pageA);
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();

  // 9. A second person joins Kanso, then gets access to A's workspace.
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await contextB.newPage();
  await signUp(pageB, USER_B);

  await pageA.getByRole("button", { name: "Members" }).click();
  await pageA.fill("#member-email", USER_B.email);
  await pageA.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    pageA.getByText("Added. They now see this application in their dashboard."),
  ).toBeVisible();
  await pageA.getByRole("button", { name: "Close", exact: true }).click();

  // 10. Second user: same shared data, their own interface.
  await pageB.goto("/dashboard");
  await openApp(pageB);

  await expect(
    pageB.getByRole("button", { name: "Open Review the launch checklist" }),
  ).toBeVisible();
  await expect(pageB.locator(".surface")).toHaveAttribute("data-theme", "light");
  await expect(pageB.locator('[data-node-type="ProgressChart"]')).toHaveCount(0);

  await pageB.fill("#ai-prompt", "Switch to light mode and add a calendar to this page");
  await pageB.press("#ai-prompt", "Enter");
  await expect(pageB.getByText("Proposed change")).toBeVisible({ timeout: 40_000 });
  await pageB.getByRole("button", { name: "Apply change" }).click();
  await expect(pageB.getByText("Applied to your interface")).toBeVisible();
  await expect(pageB.locator('[data-node-type="Calendar"]')).toBeVisible();

  // 11. User A's layout is untouched by user B's changes.
  await pageA.reload();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();
  await expect(pageA.locator('[data-node-type="Calendar"]')).toHaveCount(0);

  // 12. Role boundaries: B becomes a viewer and loses write access.
  await pageA.getByRole("button", { name: "Members" }).click();
  const memberRow = pageA.locator("li", { hasText: USER_B.email });
  await memberRow.getByRole("combobox").selectOption("viewer");
  await expect(memberRow.getByRole("combobox")).toHaveValue("viewer");
  await pageA.getByRole("button", { name: "Close", exact: true }).click();

  await pageB.reload();
  await expect(pageB.getByRole("button", { name: "New task" })).toHaveCount(0);

  const appId = pageB.url().split("/apps/")[1]!;
  const forbidden = await pageB.request.post(`/api/apps/${appId}/records`, {
    data: { kind: "task", title: "Should be rejected" },
  });
  expect(forbidden.status()).toBe(403);

  // 13. Restore an earlier interface version.
  await pageA.getByRole("button", { name: /versions?$/ }).first().click();
  await pageA
    .getByRole("button", { name: "Restore version: Generated from your description" })
    .click();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "light");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toHaveCount(0);

  // 13b. Undo puts the previous version back.
  await pageA.getByRole("button", { name: /versions?$/ }).first().click();
  await pageA.getByRole("button", { name: "Undo last change" }).click();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");

  // 14. Mobile layout: navigation collapses to a sheet and the canvas stacks.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const pageMobile = await mobile.newPage();
  await signIn(pageMobile, USER_A);
  await openApp(pageMobile);

  await expect(pageMobile.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expect(pageMobile.getByRole("button", { name: "Version history" })).toHaveCount(0);

  const columns = await pageMobile
    .locator(".surface-grid")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(1);

  await pageMobile.getByRole("button", { name: "Toggle interface assistant" }).click();
  await expect(pageMobile.locator("#ai-prompt")).toBeVisible();

  await contextA.close();
  await contextB.close();
  await mobile.close();
});

test("rejects cross-workspace access and unauthenticated API calls", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const anonymous = await context.request.get("/api/apps/app_unknown/records");
  expect(anonymous.status()).toBe(401);

  await signIn(page, USER_A);
  await openApp(page);
  const appId = page.url().split("/apps/")[1]!;

  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await signUp(outsiderPage, {
    name: "Outsider Olive",
    email: "olive@example.com",
    password: "not-a-member-pass",
  });

  const blocked = await outsider.request.get(`/api/apps/${appId}/records`);
  expect(blocked.status()).toBe(403);

  // The workspace page streams its loading shell, so the status stays 200 while
  // the access boundary renders the not-found UI. What matters is that no
  // application content leaks.
  await outsiderPage.goto(`/apps/${appId}`);
  await expect(outsiderPage.getByText(/isn.t available/i)).toBeVisible();
  await expect(outsiderPage.getByRole("heading", { name: "Overview", level: 1 })).toHaveCount(0);
  await expect(outsiderPage.getByText("Review the launch checklist")).toHaveCount(0);

  await context.close();
  await outsider.close();
});

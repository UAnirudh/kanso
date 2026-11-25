import { expect, test, type Page } from "@playwright/test";

/**
 * The non-negotiable acceptance scenario, exercised against a real server,
 * a real SQLite database and the real interface pipeline.
 *
 * There is no sign-in by design: each browser receives a guest identity, and
 * every guest joins the one shared workspace. The interesting property is that
 * shared data and personal interfaces stay independent per browser.
 *
 * No GROQ_API_KEY is configured for this run, so the interface assistant uses
 * its deterministic rule planner. The pipeline under test (schema validation,
 * proposal, preview, apply, revision, restore) is identical either way.
 */

const PROMPT =
  "Create a project management application with team workspaces, a kanban board, a calendar and delivery analytics";

async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);
  const chip = page.getByTestId("guest-name").first();
  await expect(chip).toBeVisible();
  return (await chip.innerText()).trim();
}

async function openApp(page: Page) {
  await page.getByRole("link", { name: /Project workspace/ }).first().click();
  await expect(page).toHaveURL(/\/apps\/app_/);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("per-browser adaptive interface over one shared workspace", async ({ browser }) => {
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();

  // 1. Opening Kanso mints a guest identity — no account, no form.
  const guestA = await openDashboard(pageA);
  expect(guestA).toMatch(/^Guest [0-9A-F]{4}$/);

  // 2. Generate a project-management application.
  await pageA.fill("#app-prompt", PROMPT);
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

  // 3b. The app's shared data exports as a downloadable JSON file, and the file
  // carries the record that was just created.
  const appIdA = pageA.url().split("/apps/")[1]!;
  const exported = await pageA.request.get(`/api/apps/${appIdA}/export`);
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-disposition"]).toContain("attachment; filename=");
  const exportBody = (await exported.json()) as {
    app: { id: string };
    tasks: Array<{ title: string }>;
  };
  expect(exportBody.app.id).toBe(appIdA);
  expect(exportBody.tasks.map((task) => task.title)).toContain("Review the launch checklist");

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

  // 8. Survives a refresh and a full re-navigation (the cookie is the identity).
  await pageA.reload();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();

  await pageA.goto("/dashboard");
  expect((await pageA.getByTestId("guest-name").first().innerText()).trim()).toBe(guestA);
  await openApp(pageA);
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();

  // 9. A second browser is a second guest, and joins the same workspace with no invite.
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await contextB.newPage();
  const guestB = await openDashboard(pageB);
  expect(guestB).not.toBe(guestA);

  await openApp(pageB);
  await expect(
    pageB.getByRole("button", { name: "Open Review the launch checklist" }),
  ).toBeVisible();
  await expect(pageB.locator(".surface")).toHaveAttribute("data-theme", "light");
  await expect(pageB.locator('[data-node-type="ProgressChart"]')).toHaveCount(0);

  // 10. B's own interface changes, over the same data.
  await pageB.fill("#ai-prompt", "Switch to light mode and add a calendar to this page");
  await pageB.press("#ai-prompt", "Enter");
  await expect(pageB.getByText("Proposed change")).toBeVisible({ timeout: 40_000 });
  await pageB.getByRole("button", { name: "Apply change" }).click();
  await expect(pageB.getByText("Applied to your interface")).toBeVisible();
  await expect(pageB.locator('[data-node-type="Calendar"]')).toBeVisible();

  // 11. A's interface is untouched by B's changes.
  await pageA.reload();
  await expect(pageA.locator(".surface")).toHaveAttribute("data-theme", "dark");
  await expect(pageA.locator('[data-node-type="ProgressChart"]')).toBeVisible();
  await expect(pageA.locator('[data-node-type="Calendar"]')).toHaveCount(0);

  // 12. Role boundaries: an admin demotes B to viewer. No browser owns the shared
  // workspace, so management rights never depend on one cookie.
  await pageA.getByRole("button", { name: "Members" }).click();
  const memberRow = pageA.locator("li", { hasText: guestB });
  await expect(memberRow).toBeVisible();
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

  // 13c. The workspace outlives this browser. Clearing its cookie starts a new
  // guest that is still an equal manager, so the stale row can be retired and the
  // workspace never ends up with nobody able to manage it.
  await pageA.context().clearCookies();
  await pageA.goto("/dashboard");
  const guestC = (await pageA.getByTestId("guest-name").first().innerText()).trim();
  expect(guestC).toMatch(/^Guest [0-9A-F]{4}$/);
  expect([guestA, guestB]).not.toContain(guestC);

  await openApp(pageA);
  await pageA.getByRole("button", { name: "Members" }).click();
  const staleRow = pageA.locator("li", { hasText: guestA });
  await expect(staleRow).toBeVisible();
  await staleRow.getByRole("button", { name: "Remove" }).click();
  await expect(staleRow).toHaveCount(0);
  await pageA.getByRole("button", { name: "Close", exact: true }).click();

  // 14. Mobile layout: navigation collapses to a sheet and the canvas stacks.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const pageMobile = await mobile.newPage();
  await openDashboard(pageMobile);
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

test("identity, health and role boundaries are enforced server-side", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // A request without the device cookie never gets an invented identity.
  const anonymous = await context.request.get("/api/apps/app_unknown/records");
  expect(anonymous.status()).toBe(401);
  const anonymousExport = await context.request.get("/api/apps/app_unknown/export");
  expect(anonymousExport.status()).toBe(401);

  // The health endpoint used by Docker and Render answers from the real database.
  const health = await context.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true, db: "up" });

  // A fresh browser joins the shared workspace, then hits the access boundaries.
  await openDashboard(page);
  const appLink = page.getByRole("link", { name: /Project workspace/ }).first();
  await expect(appLink).toBeVisible();
  const href = await appLink.getAttribute("href");
  const appId = href!.split("/apps/")[1]!;

  const missing = await page.request.get("/api/apps/app_does_not_exist/records");
  expect(missing.status()).toBe(404);

  // The shared workspace has no owner row: it belongs to Kanso, not to a browser.
  const roster = (await (await page.request.get(`/api/apps/${appId}/members`)).json()) as {
    members: Array<{ userId: string; name: string; role: string }>;
  };
  expect(roster.members.length).toBeGreaterThan(0);
  expect(roster.members.every((member) => member.role !== "owner")).toBe(true);

  // Another browser joins with the same rights; this admin demotes it to viewer.
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  const guestB = await openDashboard(secondPage);
  const joined = (await (await page.request.get(`/api/apps/${appId}/members`)).json()) as {
    members: Array<{ userId: string; name: string }>;
  };
  const target = joined.members.find((member) => member.name === guestB);
  expect(target).toBeTruthy();
  const demoted = await page.request.patch(`/api/apps/${appId}/members`, {
    data: { userId: target!.userId, role: "viewer" },
  });
  expect(demoted.status()).toBe(200);

  // A demoted browser reads the shared data but cannot manage members or write.
  const readable = await secondPage.request.get(`/api/apps/${appId}/records`);
  expect(readable.status()).toBe(200);

  const cannotManage = await secondPage.request.patch(`/api/apps/${appId}/members`, {
    data: { userId: target!.userId, role: "admin" },
  });
  expect(cannotManage.status()).toBe(403);

  const cannotWrite = await secondPage.request.post(`/api/apps/${appId}/records`, {
    data: { kind: "task", title: "Should be rejected" },
  });
  expect(cannotWrite.status()).toBe(403);

  await second.close();
  await context.close();
});

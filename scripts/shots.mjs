/**
 * Visual QA harness: drives the running dev server and writes screenshots to
 * ./screenshots so the rendered UI can actually be inspected.
 *   node scripts/shots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.SHOT_BASE_URL || "http://127.0.0.1:3000";
const outDir = path.join(process.cwd(), "screenshots");
fs.mkdirSync(outDir, { recursive: true });

const email = `shot.${Date.now()}@example.com`;
const password = "screenshot-pass-1";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(String(error)));

async function shot(name, options = {}) {
  await page.waitForTimeout(350);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, ...options });
  console.log(`saved ${path.relative(process.cwd(), file)}`);
}

await page.goto(`${base}/login`);
await shot("01-login");

await page.goto(`${base}/signup`);
await page.fill("#signup-name", "Ada Lovelace");
await page.fill("#signup-email", email);
await page.fill("#signup-password", password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/dashboard");
await page.waitForTimeout(600);
await shot("02-dashboard-empty");

await page.fill(
  "#app-prompt",
  "Create a project management application with a kanban board, a calendar and delivery analytics",
);
await page.fill("#app-name", "Northstar delivery");
await page.getByRole("button", { name: "Generate", exact: true }).click();
await page.waitForURL("**/apps/app_*", { timeout: 45000 });
await page.waitForSelector('[data-node-type="TaskBoard"]');
await page.waitForTimeout(800);
await shot("03-workspace-overview");

await page.getByRole("button", { name: "New task" }).first().click();
await page.waitForTimeout(250);
await shot("04-task-dialog");
await page.getByRole("button", { name: "Cancel" }).click();

await page.getByRole("button", { name: "Customize" }).click();
await page.waitForTimeout(300);
await shot("05-visual-edit-mode");
await page.getByRole("button", { name: "Editing" }).click();

await page.getByRole("button", { name: "Appearance" }).click();
await page.waitForTimeout(250);
await shot("06-appearance");
await page.keyboard.press("Escape");
await page.locator("body").click({ position: { x: 700, y: 400 } });

await page.fill(
  "#ai-prompt",
  "Move my tasks to the left, add a progress chart on the right, and switch to dark mode.",
);
await page.press("#ai-prompt", "Enter");
await page.getByText("Proposed change").waitFor({ timeout: 45000 });
await page.waitForTimeout(700);
await shot("07-ai-proposal-preview");

await page.getByRole("button", { name: "Apply change" }).click();
await page.getByText("Applied to your interface").waitFor();
await page.waitForTimeout(900);
await shot("08-applied-dark");

await page.getByRole("button", { name: /versions?$/ }).first().click();
await page.waitForTimeout(320);
await shot("09-version-history");
await page.getByRole("button", { name: "Close version history" }).click();

await page.getByRole("button", { name: "Analytics" }).click();
await page.waitForTimeout(700);
await shot("10-analytics-page");

await page.getByRole("button", { name: "Calendar", exact: true }).click();
await page.waitForTimeout(700);
await shot("10b-calendar-page");

await page.getByRole("button", { name: "Members" }).click();
await page.waitForTimeout(300);
await shot("11-members");
await page.getByRole("button", { name: "Close", exact: true }).click();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${base}/login`);
await mobilePage.fill("#login-email", email);
await mobilePage.fill("#login-password", password);
await mobilePage.getByRole("button", { name: "Sign in" }).click();
await mobilePage.waitForURL("**/dashboard");
await mobilePage.waitForTimeout(400);
await mobilePage.screenshot({ path: path.join(outDir, "12-mobile-dashboard.png") });
console.log("saved screenshots/12-mobile-dashboard.png");

await mobilePage.getByRole("link", { name: /Northstar delivery/ }).first().click();
await mobilePage.waitForURL("**/apps/app_*");
await mobilePage.waitForSelector('[data-node-type="TaskBoard"]');
await mobilePage.waitForTimeout(600);
await mobilePage.screenshot({ path: path.join(outDir, "13-mobile-workspace.png") });
console.log("saved screenshots/13-mobile-workspace.png");

await mobilePage.getByRole("button", { name: "Toggle interface assistant" }).click();
await mobilePage.waitForTimeout(400);
await mobilePage.screenshot({ path: path.join(outDir, "14-mobile-assistant.png") });
console.log("saved screenshots/14-mobile-assistant.png");

await mobilePage.getByRole("button", { name: "Close assistant" }).last().click();
await mobilePage.waitForTimeout(300);
await mobilePage.getByRole("button", { name: "Open navigation" }).click();
await mobilePage.waitForTimeout(350);
await mobilePage.screenshot({ path: path.join(outDir, "15-mobile-nav.png") });
console.log("saved screenshots/15-mobile-nav.png");

if (problems.length > 0) {
  console.log("\nConsole errors:");
  for (const problem of [...new Set(problems)]) console.log(`  - ${problem}`);
} else {
  console.log("\nNo console errors.");
}

await browser.close();

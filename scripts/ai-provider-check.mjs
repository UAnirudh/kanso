/**
 * Verifies the real provider path without a valid key: the server must call Groq,
 * map the rejection to a safe error, and leave the interface untouched.
 *
 * Usage (server must already be running with a deliberately invalid key):
 *   DATABASE_PATH=.data/provider-check.db GROQ_API_KEY=invalid-key npx next dev -p 3200
 *   SHOT_BASE_URL=http://127.0.0.1:3200 node scripts/ai-provider-check.mjs
 */
import { chromium } from "@playwright/test";

const base = process.env.SHOT_BASE_URL || "http://127.0.0.1:3200";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let failed = false;

try {
  // No sign-in: the first request mints a guest identity for this browser.
  await page.goto(base);
  await page.waitForURL("**/dashboard");

  await page.fill("#app-prompt", "Create a project management application with a kanban board");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForURL("**/apps/app_*", { timeout: 45000 });
  await page.waitForSelector('[data-node-type="TaskBoard"]');

  const before = await page.locator(".surface").getAttribute("data-theme");
  await page.fill("#ai-prompt", "Switch to dark mode");
  await page.press("#ai-prompt", "Enter");

  await page.getByText("No change was applied").waitFor({ timeout: 60000 });
  const message = await page.locator('[role="alert"]').first().innerText();
  const after = await page.locator(".surface").getAttribute("data-theme");

  console.log(
    JSON.stringify(
      {
        providerPath: "groq",
        errorShown: message.split("\n").slice(0, 2).join(" — "),
        themeBefore: before,
        themeAfter: after,
        interfaceUnchanged: before === after,
      },
      null,
      2,
    ),
  );
  failed = before !== after;
} catch (error) {
  failed = true;
  console.error("Provider check failed:", error instanceof Error ? error.message : error);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);

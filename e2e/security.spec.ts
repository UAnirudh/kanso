import { expect, test } from "@playwright/test";

/**
 * T-016: every app route ships the security headers from `next.config.mjs`.
 *
 * The suite runs the dev server over plain HTTP, so HSTS must be absent here; the
 * production build adds it. The last assertion is the important one: a CSP that
 * blocks Next's inline bootstrap scripts still renders server HTML but never
 * hydrates, so the check clicks through a client-side link and watches for the
 * browser's CSP violations in the console.
 */
test("security headers are set and the app still hydrates under CSP", async ({ page, request }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy/i.test(message.text())) {
      cspErrors.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("base-uri 'self'");
  expect(headers["content-security-policy"]).toContain("form-action 'self'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-dns-prefetch-control"]).toBe("off");
  // Dev server is HTTP; production adds HSTS in the same headers() function.
  expect(headers["strict-transport-security"]).toBeUndefined();

  // "/" mints a guest and redirects; the dashboard proves the document is served.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("guest-name").first()).toBeVisible();

  // Client-side navigation only works if React hydrated; a CSP that blocked the
  // inline bootstrap would leave this link dead.
  await page.getByRole("link", { name: "Metrics" }).click();
  await expect(page).toHaveURL(/\/metrics/);
  await expect(
    page.getByRole("heading", { name: /What the assistant costs/ }),
  ).toBeVisible();

  expect(cspErrors).toEqual([]);

  // API responses carry the same headers: a JSON error must not be sniffable,
  // and an HTML page must not be able to frame an endpoint.
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

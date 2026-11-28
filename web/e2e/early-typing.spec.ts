import { expect, test } from "@playwright/test";

// On a slow phone people start typing before the page's scripts have loaded. That text (and
// a password manager's autofill) must survive the page coming alive, or "Sign in" silently
// does nothing. Found by Safari runs where the email box came back empty.
test("typing before the page finishes loading still signs you in", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/login", { waitUntil: "commit" });
  await page.getByLabel("Email").fill("student@demo.gsht");
  await page.getByLabel("Password").fill("demo-password-123");
  release();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Email")).toHaveValue("student@demo.gsht");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/student$/);
});

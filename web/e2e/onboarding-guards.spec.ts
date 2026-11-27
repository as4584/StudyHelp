import { expect, test } from "@playwright/test";
import { login } from "./session";

test("a name of only spaces can't finish sign-up", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const page = await (await browser.newContext(vp ? { viewport: vp } : {})).newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-blank-${Date.now()}@demo.gsht`);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboard$/);
  await page.getByLabel("Display name").fill("    ");
  await page.getByLabel("Full name").fill("Sam Student");
  await page.getByLabel("Date of birth").fill("2001-04-02");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
  await page.getByLabel("Display name").fill("  Sam ");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/student$/);
  await page.context().close();
});

test("someone already set up who opens sign-up again lands on their desk", async ({ browser, page: initial }) => {
  for (const [email, home] of [
    ["student@demo.gsht", /\/student$/],
    ["tutor@demo.gsht", /\/tutor$/],
  ] as const) {
    const page = await login(browser, email, initial.viewportSize());
    await page.goto("/onboard");
    await page.waitForURL(home);
    await page.context().close();
  }
});

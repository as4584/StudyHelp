import { expect, test } from "@playwright/test";

// Runs with Cloudflare's published Turnstile test keys (always pass), so no real keys are
// needed. The API verifies the token server-side; the browser state is only a convenience.
test("sign-up waits for the bot check and sends its token to the API", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const page = await (await browser.newContext(vp ? { viewport: vp } : {})).newPage();
  await page.goto("/signup");
  await expect(page.getByTestId("bot-check")).toBeVisible();
  await page.getByLabel("Email").fill(`e2e-bot-${Date.now()}@demo.gsht`);
  await page.getByLabel("Password").fill("demo-password-123");
  // Submitting right away is fine: the form waits for the widget's token before sending.
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboard$/);

  await page.getByLabel("Display name").fill("Bo Check");
  await page.getByLabel("Full name").fill("Bo Check");
  await page.getByLabel("Date of birth").fill("2001-04-02");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  const finish = page.getByRole("button", { name: "Finish" });
  const sent = page.waitForRequest((r) => r.url().endsWith("/me/onboard"));
  await finish.click();
  const body = (await sent).postDataJSON() as { bot_token?: string };
  expect(body.bot_token).toBeTruthy();
  await page.waitForURL(/\/student$/);
  await page.context().close();
});

test("a refused bot check keeps you on the form with a fresh check", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const page = await (await browser.newContext(vp ? { viewport: vp } : {})).newPage();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-bot-no-${Date.now()}@demo.gsht`);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboard$/);
  // Simulate Cloudflare saying no: the API answers exactly as it does for a rejected token.
  let calls = 0;
  await page.route("**/me/onboard", async (route) => {
    calls += 1;
    if (calls === 1)
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "We couldn't confirm you're not a bot. Please complete the check and try again.",
          code: "bot_check_failed",
        }),
      });
    return route.continue();
  });
  await page.getByLabel("Display name").fill("Bo Retry");
  await page.getByLabel("Full name").fill("Bo Retry");
  await page.getByLabel("Date of birth").fill("2001-04-02");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("couldn't confirm you're not a bot")).toBeVisible();
  await expect(page).toHaveURL(/\/onboard$/);
  // A new widget produces a new token, and the second try goes through.
  await page.getByRole("button", { name: "Finish" }).click({ timeout: 20_000 });
  await page.waitForURL(/\/student$/);
  expect(calls).toBe(2);
  await page.context().close();
});

import { expect, test } from "@playwright/test";
import { login } from "./session";

// Values from the address bar go into API paths encoded, so a crafted link can't turn a
// button into a call to some other action (e.g. releasing a payment).
test("a crafted checkout link can only complete that checkout", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  const evil = "x/../../../tasks/00000000-0000-0000-0000-000000000000/release?";
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") calls.push(new URL(r.url()).pathname + new URL(r.url()).search);
  });
  await page.goto(
    `/checkout/simulated/${encodeURIComponent(evil)}?kind=task_payment&task_id=${encodeURIComponent("../me?")}`,
  );
  const done = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/simulated/"));
  await page.getByRole("button", { name: "Pay now" }).click();
  expect((await done).status()).toBe(404);
  expect(calls.some((c) => c.includes("/release"))).toBe(false);
  expect(calls.some((c) => /^\/simulated\/checkout\/x%(25)?2F.*\/complete$/.test(c))).toBe(true);
  await page.context().close();
});

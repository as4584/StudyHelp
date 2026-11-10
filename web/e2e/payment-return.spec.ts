import { expect, test } from "@playwright/test";

import type { PaymentState } from "../src/lib/api";

// These UI-state tests mock only API reads. The demo loop covers signed simulated events.
const TASK = "00000000-0000-4000-8000-000000000019";
const RETURN = `/payments/return?status=success&kind=task_payment&task_id=${TASK}`;
const payment = (status: string): PaymentState => ({
  payment: {
    id: "00000000-0000-4000-8000-000000000020",
    task_id: TASK,
    amount_cents: 2000,
    platform_fee_bps: 2500,
    platform_fee_cents: 500,
    tutor_net_cents: 1500,
    status,
    created_at: "2026-11-10T00:00:00Z",
  },
  transfer: null,
  tips_cents: 0,
});

test("a success URL waits for the API to confirm held funds", async ({ page }) => {
  let confirmed = false;
  await page.route(`**/tasks/${TASK}/payment`, (route) =>
    route.fulfill({ json: payment(confirmed ? "held" : "pending") }),
  );
  await page.goto(RETURN);
  await expect(page.getByRole("heading", { name: "Confirming your payment." })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress" }).getByRole("listitem").first()).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toHaveCount(0);
  confirmed = true;
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress" })).toContainText("$20.00");
});

test("missing confirmation stops polling and offers a read-only retry", async ({ page }) => {
  let reads = 0;
  let confirmed = false;
  await page.route(`**/tasks/${TASK}/payment`, (route) => {
    reads += 1;
    return route.fulfill({ json: confirmed ? payment("held") : { payment: null, transfer: null, tips_cents: 0 } });
  });
  await page.goto(RETURN);
  await expect(page.getByRole("heading", { name: "Payment confirmation is pending." })).toBeVisible();
  expect(reads).toBe(5);
  confirmed = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toBeVisible();
  expect(reads).toBe(6);
});

test("a previous task's late confirmation cannot confirm a different task", async ({ page }) => {
  const other = "00000000-0000-4000-8000-000000000021";
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/tasks/${TASK}/payment`, async (route) => {
    await deferred;
    await route.fulfill({ json: payment("held") });
  });
  await page.route(`**/tasks/${other}/payment`, (route) => route.fulfill({ json: payment("pending") }));
  const firstRead = page.waitForRequest(`**/tasks/${TASK}/payment`);
  await page.goto(RETURN);
  await firstRead;
  const otherRead = page.waitForResponse(`**/tasks/${other}/payment`);
  await page.evaluate((url) => window.history.pushState(null, "", url), RETURN.replace(TASK, other));
  await otherRead;
  const oldRead = page.waitForResponse(`**/tasks/${TASK}/payment`);
  release();
  await oldRead;
  // Wait for the new context's bounded confirmation cycle to finish as well.
  await expect(page.getByRole("heading", { name: "Payment confirmation is pending." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toHaveCount(0);
});

test("a failed confirmation read never claims payment succeeded and can be retried", async ({ page }) => {
  let available = false;
  await page.route(`**/tasks/${TASK}/payment`, (route) =>
    available
      ? route.fulfill({ json: payment("held") })
      : route.fulfill({ status: 403, json: { detail: "Account suspended" } }),
  );
  await page.goto(RETURN);
  await expect(page.getByRole("heading", { name: "We couldn't confirm your payment." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { name: "Your payment is held." })).toBeVisible();
});

for (const [status, title] of [
  ["released", "Your payment was released."],
  ["refunded", "Your payment was refunded."],
  ["expired", "This checkout expired."],
]) {
  test(`a revisited return shows the API's ${status} state`, async ({ page }) => {
    await page.route(`**/tasks/${TASK}/payment`, (route) => route.fulfill({ json: payment(status) }));
    await page.goto(RETURN);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your payment is held." })).toHaveCount(0);
  });
}

test("Premium stays unconfirmed until the API reports the entitlement", async ({ page }) => {
  let premium = false;
  await page.route("**/me", (route) => route.fulfill({ json: { premium } }));
  await page.goto("/payments/return?status=success&kind=subscription");
  await expect(page.getByRole("heading", { name: "Confirming Premium." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium is on." })).toHaveCount(0);
  premium = true;
  await expect(page.getByRole("heading", { name: "Premium is on." })).toBeVisible();
});

test("a tip return cannot prove that a particular tip was paid", async ({ page }) => {
  await page.goto(`/payments/return?status=success&kind=tip&task_id=${TASK}`);
  await expect(page.getByRole("heading", { name: "Check your tip in your session." })).toBeVisible();
  await expect(page.getByText("your tip is on its way", { exact: false })).toHaveCount(0);
});

test("a success URL without task context cannot confirm held funds", async ({ page }) => {
  await page.goto("/payments/return?status=success&kind=task_payment");
  await expect(page.getByRole("heading", { name: "Check your payment status." })).toBeVisible();
});

test("closing checkout does not assert that no charge was made", async ({ page }) => {
  await page.goto(`/payments/return?status=cancel&task_id=${TASK}`);
  await expect(page.getByRole("heading", { name: "Checkout cancelled" })).toBeVisible();
  await expect(page.getByText("No charge was made.", { exact: false })).toHaveCount(0);
});

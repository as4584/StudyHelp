import { expect, type Browser, type Page, test } from "@playwright/test";

/**
 * Live video entry points. A paid session is set up through the API (the demo loop already
 * covers the UI for posting, bidding, hiring and paying), then both parties open the call.
 * The gate runs the fake video provider, so the call page must say plainly that it is a
 * preview-only demo instead of pretending to connect.
 */

const PASSWORD = "demo-password-123";
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";

async function login(browser: Browser, email: string, viewport: { width: number; height: number } | null) {
  const ctx = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    permissions: ["camera", "microphone"],
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(student|tutor|admin)$/);
  return page;
}

async function token(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const raw = cookies.filter((c) => c.name.includes("auth-token")).sort((a, b) => a.name.localeCompare(b.name));
  let value = raw.map((c) => c.value).join("");
  if (value.startsWith("base64-")) value = Buffer.from(value.slice(7), "base64").toString();
  return JSON.parse(value).access_token as string;
}

async function call(page: Page, path: string, body?: unknown) {
  const res = await page.request.fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${await token(page)}` },
    data: body,
  });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

async function paidSession(student: Page, tutor: Page): Promise<string> {
  const task = await call(student, "/tasks", {
    subject: "Mathematics",
    level: "college",
    title: `Walk me through limits ${Date.now()}`,
    description: "Live session please, I'll share my worksheet.",
    budget_cents: 1500,
    honor_code_ack: true,
  });
  const bid = await call(tutor, `/tasks/${task.id}/bids`, { amount_cents: 1500, message: "Let's do it live" });
  await call(student, `/tasks/${task.id}/hire`, { bid_id: bid.id });
  const checkout = await call(student, `/tasks/${task.id}/checkout`, {});
  const sessionId = String(checkout.url).split("?")[0].split("/").pop();
  await call(student, `/simulated/checkout/${sessionId}/complete`, {});
  return task.id as string;
}

test("both parties can open the live session; outsiders cannot", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  for (const party of [student, tutor]) {
    await party.goto(`/tasks/${taskId}`);
    const start = party.getByRole("link", { name: "Start video session" });
    await expect(start).toBeVisible();
    await start.click();
    await party.waitForURL(new RegExp(`/tasks/${taskId}/call$`));
    await expect(party.getByTestId("local-preview")).toBeVisible(); // pre-join device preview
    await party.getByRole("button", { name: "Join session" }).click();
    await expect(party.getByText("Demo mode")).toBeVisible();
    await expect(party.getByRole("button", { name: /camera/i })).toBeVisible();
    await expect(party.getByRole("button", { name: /microphone/i })).toBeVisible();
  }

  // Camera toggle works and does not end the session.
  await student.getByRole("button", { name: "Turn camera off" }).click();
  await expect(student.getByRole("button", { name: "Turn camera on" })).toBeVisible();

  // Ending the session closes it for both sides.
  await student.getByRole("button", { name: "End session" }).click();
  await expect(student.getByText("This video session has ended")).toBeVisible();
  await tutor.goto(`/tasks/${taskId}`);
  await expect(tutor.getByRole("link", { name: "Start video session" })).toHaveCount(0);

  // A tutor who is not on this session gets nothing.
  const outsider = await login(browser, "tutor2@demo.gsht", viewport);
  await outsider.goto(`/tasks/${taskId}/call`);
  await expect(outsider.getByText("This video session isn't available to you")).toBeVisible();
});

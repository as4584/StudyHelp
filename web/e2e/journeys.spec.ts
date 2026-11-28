import { expect, type Page, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * The paths the demo loop doesn't walk, done through the UI on every device project:
 * a dispute an admin refunds, walking away from an unpaid hire, homework files reaching the
 * tutor, an expired sign-in, and a slow connection.
 */

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";

async function bearer(page: Page): Promise<string> {
  const raw = (await page.context().cookies())
    .filter((c) => c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name));
  let v = raw.map((c) => c.value).join("");
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64").toString();
  return `Bearer ${JSON.parse(v).access_token}`;
}

async function call(page: Page, path: string, body?: unknown) {
  const res = await page.request.fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: await bearer(page) },
    data: body,
  });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

test("a student disputes a paid session and an admin refunds it", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);
  const admin = await login(browser, "admin@demo.gsht", vp);
  const id = await paidSession(student, tutor);

  await student.goto(`/tasks/${id}`);
  await student.getByText("Problem with this session?").click();
  await student.getByPlaceholder("Describe what went wrong").fill("The tutor never showed up for the call.");
  await student.getByRole("button", { name: "Open dispute" }).click();
  await expect(student.getByText("Dispute opened")).toBeVisible();
  await expect(student.getByTestId("status").first()).toHaveText("disputed");

  // Neither side can release or deliver while the dispute is open.
  await tutor.goto(`/tasks/${id}`);
  await expect(tutor.getByRole("button", { name: "Mark as delivered" })).toHaveCount(0);

  await admin.goto("/admin");
  const row = admin
    .getByRole("listitem")
    .filter({ has: admin.getByRole("link", { name: `Session ${id.slice(0, 8)}` }) });
  await row.getByPlaceholder("Resolution note").fill("No-show confirmed with the tutor.");
  await row.getByRole("button", { name: "Refund student" }).click();
  await expect(row.getByText(/Resolved · refund/)).toBeVisible();

  await student.reload();
  await expect(student.getByTestId("status").first()).toHaveText("refunded");
  for (const p of [student, tutor, admin]) await p.context().close();
});

test("a student can walk away from a hire they never paid for", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);
  const task = await call(student, "/tasks", {
    subject: "Chemistry",
    level: "college",
    title: `Balance redox equations ${Date.now()}`,
    description: "Half-reaction method please.",
    budget_cents: 1800,
    honor_code_ack: true,
  });
  const bid = await call(tutor, `/tasks/${task.id}/bids`, { amount_cents: 1800, message: "Happy to help" });
  await call(student, `/tasks/${task.id}/hire`, { bid_id: bid.id });

  await student.goto(`/tasks/${task.id}`);
  await student.getByText("Cancel this request").click();
  await student.getByRole("button", { name: "Cancel request" }).click();
  await expect(student.getByTestId("status").first()).toHaveText("cancelled");
  // The tutor no longer has it as an active session.
  await tutor.goto(`/tasks/${task.id}`);
  await expect(tutor.getByTestId("status").first()).toHaveText("cancelled");
  for (const p of [student, tutor]) await p.context().close();
});

test("homework a student attaches reaches the tutor and opens", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);
  const id = await paidSession(student, tutor);

  await student.goto(`/tasks/${id}`);
  // 1x1 PNG: a "screenshot of the rubric".
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await student
    .getByRole("main")
    .locator("input[type=file]")
    .first()
    .setInputFiles({ name: "rubric.png", mimeType: "image/png", buffer: png });
  await expect(student.getByText("rubric.png")).toBeVisible({ timeout: 30_000 });

  await tutor.goto(`/tasks/${id}`);
  await expect(tutor.getByText("rubric.png")).toBeVisible();
  const opened = tutor.context().waitForEvent("page");
  await tutor.getByRole("button", { name: "Open" }).first().click();
  const tab = await opened;
  // The tab opens blank during the tap (so Safari allows it), then goes to the signed link.
  await tab.waitForURL((u) => u.href !== "about:blank", { timeout: 15_000 });
  for (const p of [student, tutor]) await p.context().close();
});

test("an expired sign-in sends you to log in instead of a broken page", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.context().clearCookies();
  await page.goto("/student");
  await page.waitForURL(/\/login/);
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.context().close();
});

test("on a slow connection the desk still loads, with a placeholder first", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.route(`${API}/**`, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/student");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a tutor", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.context().close();
});

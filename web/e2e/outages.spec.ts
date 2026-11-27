import { expect, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * What people see when something behind the site is down. Every case: an honest, plain
 * message, a way to try again, nothing spinning forever, and nothing they typed lost.
 */

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";

test("the API down entirely: the desk says so and recovers on Try again", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.route(`${API}/**`, (route) => route.abort("connectionrefused"));
  await page.reload();
  const alert = page.getByRole("alert").filter({ hasText: "couldn't load your account" });
  await expect(alert).toBeVisible();
  await page.unroute(`${API}/**`);
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Request a tutor", exact: true })).toBeVisible();
  await page.context().close();
});

test("the AI gateway down: the question stays, the message is honest, nothing is counted", async ({
  browser,
  page: initial,
}) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.route(/\/ai\/chats\/[^/]+\/messages$/, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "The AI assistant is temporarily unavailable. Your question was not counted; please try again in a few minutes.",
            code: "provider_error",
          }),
        })
      : route.continue(),
  );
  await page.goto("/assistant");
  const box = page.getByPlaceholder("What are you stuck on?");
  await box.fill("Why is the derivative of x^2 equal to 2x?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("temporarily unavailable")).toBeVisible();
  await expect(page.getByText("Why is the derivative of x^2 equal to 2x?").first()).toBeVisible();
  await page.context().close();
});

test("chat translation down: the message still arrives in the original words", async ({ browser, page: initial }) => {
  // Fake translation fails on demand for text containing [[fail-translation]].
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  await student.goto(`/tasks/${id}`);
  const text = `Can we start with limits? [[fail-translation]] ${Date.now()}`;
  await student.getByLabel("Message").fill(text);
  await student.getByRole("button", { name: "Send" }).click();
  await tutor.goto(`/tasks/${id}`);
  await expect(tutor.getByTestId("chat-log")).toContainText(text.slice(0, 26));
  await student.context().close();
  await tutor.context().close();
});

test("file storage down: attaching says so plainly and the page keeps working", async ({ browser, page: initial }) => {
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  await student.route(/\/tasks\/[^/]+\/files$/, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "File storage is temporarily unavailable. Please try again in a minute.",
            code: "provider_error",
          }),
        })
      : route.continue(),
  );
  await student.goto(`/tasks/${id}`);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await student
    .getByRole("main")
    .locator("input[type=file]")
    .first()
    .setInputFiles({ name: "rubric.png", mimeType: "image/png", buffer: png });
  await expect(student.getByText("File storage is temporarily unavailable")).toBeVisible();
  // The rest of the session page still works: chat can still be sent.
  await student.getByLabel("Message").fill("Uploading failed, I'll describe it here instead.");
  await student.getByRole("button", { name: "Send" }).click();
  await expect(student.getByTestId("chat-log")).toContainText("I'll describe it here instead");
  await student.context().close();
  await tutor.context().close();
});

test("slow sign-in service: the button says it's working and sign-in completes", async ({ browser, page: initial }) => {
  const ctx = await browser.newContext({ viewport: initial.viewportSize() ?? undefined });
  const page = await ctx.newPage();
  await page.route(/\/auth\/v1\/token/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill("student@demo.gsht");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Signing in/ })).toBeVisible();
  await page.waitForURL(/\/student$/, { timeout: 30_000 });
  await ctx.close();
});

test("video server unreachable: the call says it couldn't connect and offers Rejoin", async ({
  browser,
  page: initial,
}) => {
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  // The API hands out a real-looking credential for a video server nobody is running.
  await student.route(/\/video\/join$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, url: "ws://127.0.0.1:9" } });
  });
  await student.goto(`/tasks/${id}/call`);
  await student.getByRole("button", { name: "Join session" }).click();
  await expect(student.getByText("We couldn't connect the call")).toBeVisible({ timeout: 60_000 });
  await expect(student.getByRole("button", { name: "Rejoin" })).toBeVisible();
  await student.context().close();
  await tutor.context().close();
});

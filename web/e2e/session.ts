import { expect, type Browser, type Page } from "@playwright/test";

/** Shared setup for the video specs: sign in, and build a paid session through the API. */

const PASSWORD = "demo-password-123";
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";

export async function login(browser: Browser, email: string, viewport: { width: number; height: number } | null) {
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

/** Posted -> bid -> hired -> paid (test checkout). The demo loop covers these steps in the UI. */
export async function paidSession(student: Page, tutor: Page): Promise<string> {
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

export const LIVE_VIDEO = process.env.E2E_LIVE_VIDEO === "1";

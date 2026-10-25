// Visual review harness: drives the real demo flow and screenshots each key screen at
// 1440 / 1024 / 390. Usage: node design/shots.mjs <label>   (servers on :3000 / :8000)
// Output: ../artifacts/design/<label>/<screen>-<width>.png
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const label = process.argv[2] ?? "current";
const BASE = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const OUT = `../artifacts/design/${label}`;
const WIDTHS = [
  [1440, 900],
  [1024, 768],
  [390, 844],
];
const PASSWORD = "demo-password-123";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shoot(page, name) {
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(w === 1440 ? 1600 : 400); // let entry motion finish (capture only)
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(student|tutor|admin)$/);
  await page.waitForLoadState("networkidle");
  return page;
}

const anon = await (await browser.newContext()).newPage();
await anon.goto(BASE);
await shoot(anon, "01-landing");
await anon.goto(`${BASE}/login`);
await shoot(anon, "02-login");

const student = await login("student@demo.gsht");
await shoot(student, "03-student-dashboard");
await student.goto(`${BASE}/student/tasks/new`);
await shoot(student, "04-new-task");
await student.getByLabel("Subject").fill("Calculus");
await student.getByLabel(/What do you need help/).fill("Understand the chain rule for composite functions");
await student
  .getByLabel("Details")
  .fill("I keep mixing up the inner and outer functions when differentiating sin(x²).");
await student.getByLabel(/Budget/).fill("40");
await student.getByRole("checkbox").check();
await student.getByRole("button", { name: "Post request" }).click();
await student.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
const taskUrl = student.url();

const tutor = await login("tutor@demo.gsht");
const setup = tutor.getByRole("button", { name: /Set up payouts/ });
await setup
  .or(tutor.getByText(/payout account is connected/i))
  .first()
  .waitFor();
if (await setup.isVisible()) {
  await setup.click();
  await tutor.getByRole("button", { name: /Complete onboarding/ }).click();
  await tutor.waitForURL(/\/tutor$/);
}
await tutor.waitForLoadState("networkidle");
await shoot(tutor, "05-tutor-hub");
await tutor.goto(taskUrl);
await tutor.waitForLoadState("networkidle");
await shoot(tutor, "06-tutor-task-open");
await tutor.getByLabel(/Your price/).fill("40");
await tutor
  .getByPlaceholder(/How you'll help/)
  .fill("I'll walk you through five worked examples, then you try three on your own.");
await tutor.getByRole("button", { name: /Submit bid/ }).click();

await student.reload();
await student.waitForLoadState("networkidle");
await shoot(student, "07-student-task-bids");
await student.getByRole("button", { name: /Hire/ }).first().click();
await student.getByRole("button", { name: /Pay .* securely/ }).click();
await student.waitForURL(/checkout\/simulated/);
await shoot(student, "08-checkout");
await student.getByRole("button", { name: "Pay now" }).click();
await student.waitForURL(/payments\/return/);
await student.goto(taskUrl);
await student.getByLabel("Message").fill("Can you explain why we multiply by the derivative of the inside?");
await student.getByRole("button", { name: "Send" }).click();
await tutor.goto(taskUrl);
await tutor.getByLabel("Message").waitFor();
await tutor.getByLabel("Message").fill("Claro. Piensa en la función interior como una capa: cambia a su propio ritmo.");
await tutor.getByRole("button", { name: "Send" }).click();
await student.waitForTimeout(1500);
await student.reload();
await student.waitForLoadState("networkidle");
await shoot(student, "09-student-task-chat");
await shoot(tutor, "10-tutor-task-chat");

// Complete the first session for real, then open a second request in another subject so the
// study path shows genuine history (finished stop + open stop + subject accents).
await tutor.getByLabel("Delivery note").fill("Recorded walkthrough of five chain-rule examples + a practice set.");
await tutor.getByRole("button", { name: "Mark as delivered" }).click();
await tutor.getByText(/student will release/).waitFor();
await student.reload();
await student.getByRole("button", { name: "Release payment to tutor" }).click();
await student.getByText("Session complete").waitFor();
await shoot(student, "10b-student-task-complete");
await student.goto(`${BASE}/student/tasks/new`);
await student.getByLabel("Subject").fill("Writing");
await student.getByLabel(/What do you need help/).fill("Structure a persuasive essay introduction");
await student.getByLabel("Details").fill("My thesis keeps getting lost in the first paragraph.");
await student.getByLabel(/Budget/).fill("30");
await student.getByRole("checkbox").check();
await student.getByRole("button", { name: "Post request" }).click();
await student.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);

// premium + assistant
await student.goto(`${BASE}/student`);
const up = student.getByRole("button", { name: "Upgrade to Premium" });
await up.or(student.getByText("AI tutor · Premium")).first().waitFor();
if (await up.isVisible()) {
  await up.click();
  await student.getByRole("button", { name: "Pay now" }).click();
  await student.waitForURL(/payments\/return/);
}
await student.goto(`${BASE}/student`);
await student.waitForLoadState("networkidle");
await shoot(student, "11-student-dashboard-active");
await student.goto(`${BASE}/assistant`);
await student.getByPlaceholder(/Subject/).fill("Physics");
await student.getByLabel("Question").fill("Why doesn't a heavier object fall faster?");
await student.getByRole("button", { name: "Ask", exact: true }).click();
await student.getByText(/work through this/).waitFor();
await shoot(student, "12-assistant");

const admin = await login("admin@demo.gsht");
await shoot(admin, "13-admin");

await browser.close();
console.log(`shots written to ${OUT}`);

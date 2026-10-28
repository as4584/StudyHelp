import { expect, type Browser, type BrowserContext, type Page, test } from "@playwright/test";

/**
 * The client demo, end to end, in a real browser against the real API + local Supabase:
 * student posts -> tutor bids -> hire -> pay (test checkout) -> EN<->ES chat -> deliver ->
 * release (fee split) -> tip -> review -> premium AI -> escalate -> admin approves + sees revenue.
 */

const PASSWORD = "demo-password-123";
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";

async function login(browser: Browser, email: string, viewport: { width: number; height: number } | null) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(student|tutor|admin)$/);
  return { ctx, page };
}

async function token(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const raw = cookies.filter((c) => c.name.includes("auth-token")).sort((a, b) => a.name.localeCompare(b.name));
  let value = raw.map((c) => c.value).join("");
  if (value.startsWith("base64-")) value = Buffer.from(value.slice(7), "base64").toString();
  return JSON.parse(value).access_token as string;
}

test("full three-role demo loop", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const contexts: BrowserContext[] = [];
  const open = async (email: string) => {
    const s = await login(browser, email, viewport);
    contexts.push(s.ctx);
    return s.page;
  };

  // --- A brand-new tutor registers and applies --------------------------------------
  const runId = Date.now();
  const applicantEmail = `e2e-tutor-${runId}@demo.gsht`;
  const applicantName = `E2E Applicant ${runId}`;
  const applicantCtx = await browser.newContext(viewport ? { viewport } : {});
  contexts.push(applicantCtx);
  const applicant = await applicantCtx.newPage();
  await applicant.goto("/signup");
  await applicant.getByLabel("Email").fill(applicantEmail);
  await applicant.getByLabel("Password").fill(PASSWORD);
  await applicant.getByRole("button", { name: "Continue" }).click();
  await applicant.waitForURL(/\/onboard$/);
  await applicant.getByRole("button", { name: /I'm a tutor/ }).click();
  await applicant.getByLabel("Display name").fill(applicantName);
  await applicant.getByLabel("Preferred language").selectOption("fr");
  await applicant.getByRole("button", { name: "Finish" }).click();
  await applicant.waitForURL(/\/tutor$/);
  await applicant.getByLabel("Subjects").fill("Chemistry, Biology");
  await applicant.getByRole("button", { name: "Submit application" }).click();
  await expect(applicant.getByText("under review")).toBeVisible();

  // --- Student posts a tutoring request ------------------------------------------------
  const student = await open("student@demo.gsht");
  await student.getByRole("link", { name: "Request a tutor", exact: true }).click();
  const title = `Understand the chain rule ${Date.now()}`;
  await student.getByLabel("Subject").fill("Calculus");
  await student.getByLabel("What do you need help understanding?").fill(title);
  await student.getByLabel("Details").fill("I keep mixing up the inner and outer functions.");
  await expect(student.getByRole("button", { name: "Post request" })).toBeDisabled(); // level is required
  await student.getByRole("group", { name: "Level" }).getByRole("button", { name: "College" }).click();
  await student.getByRole("group", { name: "Language" }).getByRole("button", { name: "Español" }).click();
  await student.getByLabel("Budget (USD)").fill("40");
  await student.getByRole("checkbox").check();
  await student.getByRole("button", { name: "Post request" }).click();
  await student.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  const taskUrl = new URL(student.url()).pathname;
  await expect(student.getByTestId("status").first()).toHaveText("open");

  // --- Tutor connects payouts (simulated Express onboarding) and bids -----------------
  const tutor = await open("tutor@demo.gsht");
  const setup = tutor.getByRole("button", { name: "Set up payouts" });
  const connected = tutor.getByText("Your payout account is connected");
  await expect(setup.or(connected)).toBeVisible(); // wait for the hub to load before branching
  if (await setup.isVisible()) {
    await setup.click();
    await tutor.getByRole("button", { name: "Complete onboarding" }).click();
    await tutor.waitForURL(/\/tutor$/);
  }
  await expect(tutor.getByText("Your payout account is connected")).toBeVisible();
  await expect(tutor.getByText(title)).toBeVisible(); // tutor sees the open task
  await tutor.goto(taskUrl);
  await tutor.getByLabel("Your price (USD)").fill("40");
  await tutor.getByPlaceholder(/How you'll help/).fill("I'll walk you through 5 worked examples.");
  await tutor.getByRole("button", { name: "Submit bid" }).click();
  await expect(tutor.getByText(/You bid \$40\.00/)).toBeVisible();

  // --- Student hires and pays ----------------------------------------------------------
  await student.reload();
  await student.getByRole("button", { name: /Hire Prof\. Diego/ }).click();
  await expect(student.getByRole("status").filter({ hasText: "You hired" })).toBeVisible();
  await expect(student.getByTestId("status").first()).toHaveText("hired");
  await student.getByRole("button", { name: /Pay \$40\.00 securely/ }).click();
  await student.waitForURL(/\/pay$/);
  await expect(student.getByText("Your money is protected while you learn.")).toBeVisible();
  await student.getByRole("button", { name: "Continue to secure payment" }).click();
  await student.waitForURL(/\/checkout\/simulated\//);
  await student.getByRole("button", { name: "Pay now" }).click();
  await student.waitForURL(/\/payments\/return/);
  await student.goto(taskUrl);
  await expect(student.getByTestId("status").first()).toHaveText("paid");
  await expect(student.getByTestId("payment-card")).toContainText("$30.00");

  // --- Translated chat both ways -------------------------------------------------------
  await student.getByLabel("Message").fill("Can you explain the chain rule?");
  await student.getByRole("button", { name: "Send" }).click();
  await tutor.reload();
  await expect(tutor.getByTestId("chat-log")).toContainText("[EN→ES] Can you explain the chain rule?");
  await tutor.getByLabel("Message").fill("Claro, empecemos con un ejemplo");
  await tutor.getByRole("button", { name: "Send" }).click();
  await expect(student.getByTestId("chat-log")).toContainText("[ES→EN] Claro, empecemos con un ejemplo");

  // --- Delivery, release, tip, review --------------------------------------------------
  await tutor.getByLabel("Delivery note").fill("Recorded walkthrough + 10 practice problems with solutions.");
  await tutor.getByRole("button", { name: "Mark as delivered" }).click();
  await expect(tutor.getByText("Delivered. The student will release your payment.")).toBeVisible();

  await student.reload();
  await student.getByRole("button", { name: "Release payment to tutor" }).click();
  await expect(student.getByRole("status").filter({ hasText: "Payment released" })).toBeVisible();
  await expect(student.getByTestId("status").first()).toHaveText("completed");
  await expect(student.getByTestId("payment-card")).toContainText("released");

  // Review first; the tip is offered right after it.
  await expect(student.getByRole("button", { name: "Tip $5.00" })).toHaveCount(0);
  await student.getByLabel("Rate your tutor").selectOption("5");
  await student.getByRole("button", { name: "Submit review" }).click();
  await expect(student.getByText("You rated this session")).toBeVisible(); // no silent submit
  await student.getByRole("button", { name: "Tip $5.00" }).click();
  await student.getByRole("button", { name: "Pay now" }).click();
  await student.waitForURL(/\/payments\/return/);
  await student.goto(taskUrl);
  await expect(student.getByTestId("payment-card")).toContainText("Tips (100% to tutor)");

  // --- Premium AI assistant + escalation to a live expert ------------------------------
  await student.goto("/student");
  await expect(student.getByRole("heading", { name: "Your study path" })).toBeVisible();
  // Layout guard: the study desk must never scroll sideways (caught a mobile overflow once).
  expect(
    await student.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  const upgrade = student.getByRole("button", { name: "Upgrade to Premium" });
  await expect(upgrade.or(student.getByText("AI tutor · Premium"))).toBeVisible();
  if (await upgrade.isVisible()) {
    await upgrade.click();
    await student.getByRole("button", { name: "Pay now" }).click();
    await student.waitForURL(/\/payments\/return/);
  }
  await student.goto("/assistant");
  await student.getByPlaceholder("Subject (e.g. Calculus)").fill("Physics");
  await student.getByLabel("Question").fill("Why does a heavier object not fall faster?");
  await student.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(student.getByTestId("ai-log")).toContainText("Let's work through this together");
  await student.getByRole("button", { name: /Ask a live expert/ }).click();
  await student.waitForURL(/\/student\/tasks\/new\?/);
  await expect(student.getByLabel("Subject")).toHaveValue("Physics");
  await expect(student.getByLabel("Details")).toHaveValue(/heavier object/);

  // --- Authorization survives direct API calls (not just hidden UI) -------------------
  const studentToken = await token(student);
  const forbidden = await student.request.get(`${API}/admin/revenue`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  expect(forbidden.status()).toBe(403);

  // --- Admin approves the new tutor and sees commission --------------------------------
  const admin = await open("admin@demo.gsht");
  await expect(admin.getByTestId("stat-fees-earned")).not.toHaveText("$0.00");
  const row = admin.getByTestId("tutor-applications").locator("li", { hasText: applicantName });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText(`Tutor applications`)).toBeVisible();
  await expect(admin.getByTestId("tutor-applications").locator("li", { hasText: applicantName })).toHaveCount(0);
  await expect(admin.getByText("payment.released").first()).toBeVisible();
  await applicant.reload();
  await expect(applicant.getByRole("heading", { name: "Open requests" })).toBeVisible();

  for (const c of contexts) await c.close();
});

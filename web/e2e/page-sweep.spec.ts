import { expect, type Page, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * Every page, as every kind of visitor, on every device project: the page renders its main
 * content, fits the screen (no sideways scrolling), throws no script errors and gets no server
 * errors from the API. Cheap to run and catches the layout/console cracks flows don't look at.
 */

type Visit = { path: string; expectText?: RegExp };

const PUBLIC: Visit[] = [
  { path: "/", expectText: /StudyHelp/ },
  { path: "/login", expectText: /sign in/i },
  { path: "/signup" },
  { path: "/terms", expectText: /terms/i },
  { path: "/privacy", expectText: /privacy/i },
];

const BY_ROLE: Record<string, Visit[]> = {
  "student@demo.gsht": [
    { path: "/student" },
    { path: "/student/tasks/new" },
    { path: "/tutors" },
    { path: "/assistant" },
    { path: "/dashboard" },
    { path: "/terms" },
  ],
  "tutor@demo.gsht": [{ path: "/tutor" }, { path: "/dashboard" }],
  "admin@demo.gsht": [{ path: "/admin" }],
  "applicant@demo.gsht": [{ path: "/tutor" }],
};

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
  page.on("console", (m) => {
    // Browsers log failed fetches as console errors; those are judged by status below.
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} from ${r.request().method()} ${r.url()}`);
  });
  return problems;
}

async function check(page: Page, problems: string[], visit: Visit) {
  problems.length = 0;
  await page.goto(visit.path);
  await page.waitForLoadState("networkidle");
  const main = page.getByRole("main");
  await expect(main, `${visit.path}: no main content`).toBeVisible();
  await expect(main, `${visit.path}: blank page`).not.toHaveText(/^\s*$/);
  if (visit.expectText) await expect(page.locator("body")).toContainText(visit.expectText);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${visit.path}: page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
  expect(problems, `${visit.path}`).toEqual([]);
}

test("public pages", async ({ page }) => {
  const problems = watch(page);
  for (const v of PUBLIC) await check(page, problems, v);
});

for (const [email, visits] of Object.entries(BY_ROLE)) {
  test(`pages for ${email.split("@")[0]}`, async ({ browser, page: initial }) => {
    const page = await login(browser, email, initial.viewportSize());
    const problems = watch(page);
    for (const v of visits) await check(page, problems, v);
    await page.context().close();
  });
}

test("a paid session's pages, for both people", async ({ browser, page: initial }) => {
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  for (const page of [student, tutor]) {
    const problems = watch(page);
    await check(page, problems, { path: `/tasks/${id}` });
    await check(page, problems, { path: `/tasks/${id}/call` });
  }
  await check(student, watch(student), { path: `/tasks/${id}/pay` });
  await student.context().close();
  await tutor.context().close();
});

test("long words, emoji, right-to-left text and long links don't break the layout", async ({
  browser,
  page: initial,
}) => {
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  const word = "Supercalifragilisticexpialidocious".repeat(3);
  const link = `https://example.com/${"a".repeat(120)}`;
  // Through the UI, so the composer and the log are both exercised.
  await student.goto(`/tasks/${id}`);
  for (const text of [word, "📐🧮✏️ تفاضل وتكامل مرحبا", link]) {
    await student.getByLabel("Message").fill(text);
    await student.getByRole("button", { name: "Send" }).click();
    await expect(student.getByTestId("chat-log")).toContainText(text.slice(0, 20));
  }
  for (const page of [student, tutor]) {
    await page.goto(`/tasks/${id}`);
    await expect(page.getByTestId("chat-log")).toContainText(word.slice(0, 20));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `session page is ${overflow}px wider than the screen`).toBeLessThanOrEqual(1);
  }
  await student.context().close();
  await tutor.context().close();
});

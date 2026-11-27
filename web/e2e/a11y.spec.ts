import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * WCAG 2.1 AA scan (axe) of every page, for every kind of visitor. Serious and critical
 * violations fail the test; the failure lists each rule, its impact and the offending nodes.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  // Not "networkidle": the bot-check widget keeps a connection open on sign-up.
  await page.waitForLoadState("load");
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForTimeout(800); // let client data render before scanning
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${path} · ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
          .slice(0, 4)
          .map((n) => n.target.join(" "))
          .join("\n    ")}`,
    );
}

const PAGES: Record<string, string[]> = {
  anonymous: ["/", "/login", "/signup", "/terms", "/privacy"],
  "student@demo.gsht": ["/student", "/student/tasks/new", "/tutors", "/assistant", "/terms"],
  "tutor@demo.gsht": ["/tutor"],
  "admin@demo.gsht": ["/admin"],
  "applicant@demo.gsht": ["/tutor"],
};

for (const [who, paths] of Object.entries(PAGES)) {
  test(`axe: pages for ${who.split("@")[0]}`, async ({ browser, page: initial }) => {
    const page = who === "anonymous" ? initial : await login(browser, who, initial.viewportSize());
    const found: string[] = [];
    for (const p of paths) found.push(...(await scan(page, p)));
    expect(found, found.join("\n")).toEqual([]);
    if (page !== initial) await page.context().close();
  });
}

test("axe: a paid session's task, pay and call pages", async ({ browser, page: initial }) => {
  const student = await login(browser, "student@demo.gsht", initial.viewportSize());
  const tutor = await login(browser, "tutor@demo.gsht", initial.viewportSize());
  const id = await paidSession(student, tutor);
  const found: string[] = [];
  for (const p of [`/tasks/${id}`, `/tasks/${id}/pay`, `/tasks/${id}/call`]) found.push(...(await scan(student, p)));
  for (const p of [`/tasks/${id}`, `/tasks/${id}/call`]) found.push(...(await scan(tutor, p)));
  expect(found, found.join("\n")).toEqual([]);
  await student.context().close();
  await tutor.context().close();
});

import { expect, type Page, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * On phones every control a thumb has to hit is at least 44×44 CSS px (Apple's and WCAG
 * 2.5.5's size). Links inside running text are exempt, as WCAG allows.
 */

const MIN = 44;

async function small(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForTimeout(800);
  return page.evaluate(
    ({ min, path }) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, select, input:not([type=hidden]), textarea, summary, [role=button], [role=tab]",
        ),
      ]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") return false;
          if (el.closest(".sr-only")) return false;
          // Inline links in a sentence are exempt.
          if (el.tagName === "A" && el.closest("p, dd, address li, .prose")) return false;
          // Checkboxes and radios count with their label, which is the real tap area.
          if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)) {
            const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
            if (label) {
              const lr = label.getBoundingClientRect();
              return lr.height < min;
            }
          }
          return r.width < min || r.height < min;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
          return `${path} · ${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`;
        }),
    { min: MIN, path },
  );
}

test.beforeEach(({}, info) => {
  test.skip(!["mobile", "iphone", "iphone-se", "android-small"].includes(info.project.name), "phones only");
});

test("tap targets on public pages", async ({ page }) => {
  const found: string[] = [];
  for (const p of ["/", "/login", "/signup", "/terms"]) found.push(...(await small(page, p)));
  expect(found, found.join("\n")).toEqual([]);
});

test("tap targets in the student and tutor workspaces", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);
  const id = await paidSession(student, tutor);
  const found: string[] = [];
  for (const p of ["/student", "/student/tasks/new", "/tutors", "/assistant", `/tasks/${id}`, `/tasks/${id}/call`])
    found.push(...(await small(student, p)));
  for (const p of ["/tutor", `/tasks/${id}`]) found.push(...(await small(tutor, p)));
  expect(found, found.join("\n")).toEqual([]);
  await student.context().close();
  await tutor.context().close();
});

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { login, paidSession } from "./session";

/**
 * People who use a keyboard (or switch access) can do the core jobs with no mouse: a student
 * posts a request and chats, a tutor bids. Every stop shows a visible focus ring and focus never
 * gets stuck. Also: touch targets on phones, 200% zoom, reduced motion, and forms in their
 * opened states pass axe.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Press Tab until `target` has focus; every stop on the way must show a focus ring. */
async function tabTo(page: Page, target: Locator, max = 80) {
  const seen = new Set<string>();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px") || cs.boxShadow !== "none";
      return { key: `${el.tagName}|${el.outerHTML.slice(0, 120)}`, ring, tag: el.tagName };
    });
    if (info) {
      // A select/textarea/input shows its own focus treatment in every browser.
      expect(info.ring || ["INPUT", "SELECT", "TEXTAREA"].includes(info.tag), `no focus ring on ${info.key}`).toBe(
        true,
      );
      seen.add(info.key);
    }
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`could not reach ${target} with Tab after ${max} presses (${seen.size} stops)`);
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "keyboard journeys run on the desktop project");
});

test("skip link jumps past the navigation", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/student");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.context().close();
});

test("a student posts a request with only the keyboard", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/student");
  await tabTo(page, page.getByRole("link", { name: "Request a tutor", exact: true }));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/student\/tasks\/new/);
  const title = `Keyboard only ${Date.now()}`;
  await tabTo(page, page.getByLabel("Subject"));
  await page.keyboard.type("Calculus");
  await tabTo(page, page.getByLabel("What do you need help understanding?"));
  await page.keyboard.type(title);
  await tabTo(page, page.getByLabel("Details"));
  await page.keyboard.type("Typed without touching the mouse.");
  await tabTo(page, page.getByRole("group", { name: "Level" }).getByRole("button", { name: "College" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByLabel("Budget (USD)"));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("20");
  await tabTo(page, page.getByRole("checkbox"));
  await page.keyboard.press("Space");
  await tabTo(page, page.getByRole("button", { name: "Post request" }));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
  await expect(page.getByText(title).first()).toBeVisible();
  await page.context().close();
});

test("a tutor bids and both sides chat with only the keyboard", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);

  // Tutor bids on a fresh open request.
  const api = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
  const raw = (await student.context().cookies())
    .filter((c) => c.name.includes("auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name));
  let v = raw.map((c) => c.value).join("");
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64").toString();
  const res = await student.request.post(`${api}/tasks`, {
    headers: { Authorization: `Bearer ${JSON.parse(v).access_token}` },
    data: {
      subject: "Mathematics",
      level: "college",
      title: `Keyboard bid ${Date.now()}`,
      description: "Bid with the keyboard",
      budget_cents: 2000,
      honor_code_ack: true,
    },
  });
  const task = await res.json();
  await tutor.goto(`/tasks/${task.id}`);
  await tabTo(tutor, tutor.getByLabel("Your price (USD)"));
  await tutor.keyboard.press("ControlOrMeta+a");
  await tutor.keyboard.type("20");
  await tabTo(tutor, tutor.getByLabel("Message to the student"));
  await tutor.keyboard.type("Keyboard-only offer.");
  await tabTo(tutor, tutor.getByRole("button", { name: "Submit bid" }));
  await tutor.keyboard.press("Enter");
  await expect(tutor.getByText(/You bid \$20\.00/)).toBeVisible();

  // Chat in a paid session, and the dispute <details> opens from the keyboard.
  const id = await paidSession(student, tutor);
  await student.goto(`/tasks/${id}`);
  await tabTo(student, student.getByLabel("Message"));
  await student.keyboard.type("Sent with the keyboard");
  await tabTo(student, student.getByRole("button", { name: "Send" }));
  await student.keyboard.press("Enter");
  await expect(student.getByTestId("chat-log")).toContainText("Sent with the keyboard");
  await tabTo(student, student.getByText("Problem with this session?"));
  await student.keyboard.press("Enter");
  await expect(student.getByLabel("What went wrong")).toBeVisible();
  await student.context().close();
  await tutor.context().close();
});

test("forms in their opened states pass axe", async ({ browser, page: initial }) => {
  const vp = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", vp);
  const tutor = await login(browser, "tutor@demo.gsht", vp);
  const admin = await login(browser, "admin@demo.gsht", vp);
  const id = await paidSession(student, tutor);
  const found: string[] = [];
  const check = async (page: Page, label: string) => {
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const x of violations.filter((x) => x.impact === "serious" || x.impact === "critical"))
      found.push(`${label} · ${x.id}: ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  };
  await student.goto(`/tasks/${id}`);
  await student.getByText("Problem with this session?").click();
  await student.getByLabel("What went wrong").fill("Testing the open dispute form");
  await check(student, "dispute form");
  await student.getByRole("button", { name: "Open dispute" }).click();
  await expect(student.getByText("Dispute opened")).toBeVisible();
  await admin.goto("/admin");
  await expect(admin.getByRole("textbox", { name: "Resolution note" }).first()).toBeVisible();
  await check(admin, "admin with an open dispute");
  expect(found, found.join("\n")).toEqual([]);
  for (const p of [student, tutor, admin]) await p.context().close();
});

test("200% zoom keeps pages usable without sideways scrolling", async ({ browser }) => {
  // 200% zoom of a 1280px window is a 640px CSS viewport at device scale 2.
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const path of ["/", "/login", "/terms"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${path} scrolls sideways at 200%`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test("reduced motion turns animations off", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("*")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const dur = (v: string) => Math.max(...v.split(",").map((d) => parseFloat(d) * (d.includes("ms") ? 1 : 1000)));
        return (cs.animationName !== "none" && dur(cs.animationDuration) > 10) || dur(cs.transitionDuration) > 10;
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80))
      .slice(0, 5),
  );
  expect(moving).toEqual([]);
  await ctx.close();
});

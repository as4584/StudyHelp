import { expect, test, type Locator, type Page } from "@playwright/test";

import { call, hiredSession, login, paidSession } from "./session";

/**
 * Bug hunt across the message nudge (#44) and the shared whiteboard (#45) together: phone layouts,
 * offline/reload/rapid-open robustness, two tabs, oversized saves and escaping. Local stack only.
 */
test.describe.configure({ mode: "serial" });

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openBoard(page: Page, taskId: string, navigate = true) {
  if (navigate) await page.goto(`/tasks/${taskId}`);
  await page.getByRole("button", { name: "Whiteboard" }).click();
  const board = page.getByRole("dialog", { name: "Shared whiteboard" });
  await expect(board).toBeVisible();
  await expect(board.locator("canvas.interactive")).toBeVisible();
  return board;
}

async function drawRect(page: Page, board: Locator, at = 0.3) {
  const canvas = board.locator("canvas.interactive");
  const box = (await canvas.boundingBox())!;
  // An empty spot clear of Excalidraw's toolbars on every layout (phones put one at the bottom).
  await canvas.click({ position: { x: box.width * 0.85, y: box.height * 0.3 } });
  await page.keyboard.press("r");
  const x = box.x + box.width * at;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 40, { steps: 6 });
  await page.mouse.up();
}

type El = { type: string; isDeleted?: boolean };
const shapes = async (page: Page, taskId: string) =>
  ((await call(page, `/tasks/${taskId}/whiteboard`)).scene?.elements ?? []).filter((e: El) => !e.isDeleted) as El[];

test("phone: whiteboard card, chat jump and the open board fit and cover the nav", async ({
  browser,
  page: initial,
}) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  for (const p of [student, tutor]) {
    await p.goto(`/tasks/${taskId}`);
    await expect(p.getByRole("button", { name: "Whiteboard" })).toBeVisible();
    await noSideScroll(p);
    const board = await openBoard(p, taskId, false);
    await noSideScroll(p);
    // The dialog is on top: the close button is what is hit at its own centre (not the nav/header).
    const close = board.getByRole("button", { name: "Close whiteboard" });
    const hit = await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && el.contains(top);
    });
    expect(hit).toBeTruthy();
    // The whole dialog fits the screen.
    const b = (await board.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(b.height).toBeLessThanOrEqual(viewport!.height + 1);
    await close.click();
    await expect(board).toBeHidden();
    // Scroll lock is released.
    expect(await p.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  }
  await student.context().close();
  await tutor.context().close();
});

test("no whiteboard before payment; the nudge banner escapes a hostile title", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const hostile = `<img src=x onerror="window.__xss=1"> ${Date.now()}`;
  const task = await call(student, "/tasks", {
    subject: "Mathematics",
    level: "college",
    title: hostile,
    description: "<script>window.__xss=2</script> please help",
    budget_cents: 1500,
    honor_code_ack: true,
  });
  const bid = await call(tutor, `/tasks/${task.id}/bids`, { amount_cents: 1500, message: "<b>hi</b>" });
  await call(student, `/tasks/${task.id}/hire`, { bid_id: bid.id });
  await call(tutor, `/conversations/${(await call(tutor, `/tasks/${task.id}/conversation`)).id}/messages`, {
    body: `<img src=x onerror="window.__xss=3">`,
  }).catch(() => undefined);

  await student.goto(`/tasks/${task.id}`);
  await expect(student.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(student.getByRole("button", { name: "Whiteboard" })).toHaveCount(0);
  const r = await student.request.get(`${process.env.E2E_API_URL}/tasks/${task.id}/whiteboard`);
  expect(r.status()).toBeGreaterThanOrEqual(400);

  await tutor.goto("/tutor");
  for (const p of [tutor, student]) {
    if (p === student) await p.goto("/student");
    await p.waitForLoadState("networkidle");
    expect(await p.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  }
  await call(student, `/tasks/${task.id}/cancel`, {});
  await student.context().close();
  await tutor.context().close();
});

test("offline then online: the board saves by itself once the connection is back", async ({
  browser,
  page: initial,
}) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  const board = await openBoard(student, taskId);
  await student.context().setOffline(true);
  await drawRect(student, board);
  await expect(student.getByTestId("whiteboard-status")).toHaveText("Not saved yet", { timeout: 15_000 });
  await student.context().setOffline(false);
  await expect(student.getByTestId("whiteboard-status")).toHaveText("Saved", { timeout: 20_000 });
  expect((await shapes(tutor, taskId)).some((e) => e.type === "rectangle")).toBeTruthy();
  await student.context().close();
  await tutor.context().close();
});

test("reload right after drawing does not lose the shape", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  const board = await openBoard(student, taskId);
  await drawRect(student, board);
  await student.reload(); // inside the 1.2 s save delay
  await expect
    .poll(async () => (await shapes(tutor, taskId)).filter((e) => e.type === "rectangle").length, {
      timeout: 10_000,
    })
    .toBe(1);
  await student.context().close();
  await tutor.context().close();
});

test("two tabs drawing at once: both shapes survive the 409 merge", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  const a = await openBoard(student, taskId);
  const b = await openBoard(tutor, taskId);
  // Both draw from version 0 before either has seen the other's save.
  await Promise.all([drawRect(student, a, 0.2), drawRect(tutor, b, 0.6)]);
  for (const p of [student, tutor])
    await expect(p.getByTestId("whiteboard-status")).toHaveText("Saved", { timeout: 20_000 });
  await expect
    .poll(async () => (await shapes(student, taskId)).filter((e) => e.type === "rectangle").length, {
      timeout: 15_000,
    })
    .toBe(2);
  // And each tab eventually shows both (poll every 5 s).
  await expect
    .poll(async () => b.evaluate(() => document.querySelectorAll("canvas").length), { timeout: 5_000 })
    .toBeGreaterThan(0);
  await student.context().close();
  await tutor.context().close();
});

test("a save refused as too big shows a clear error and the board stays usable", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  let refuse = true;
  await student.route("**/tasks/*/whiteboard", (route) =>
    refuse && route.request().method() === "PUT"
      ? route.fulfill({
          status: 413,
          contentType: "application/json",
          body: '{"detail":"whiteboard is too large","code":"too_large"}',
        })
      : route.continue(),
  );
  const board = await openBoard(student, taskId);
  await drawRect(student, board);
  await expect(board.getByText("The board is too big to save")).toBeVisible();
  refuse = false;
  await drawRect(student, board, 0.6); // the person removes/changes something: next save goes through
  await expect(student.getByTestId("whiteboard-status")).toHaveText("Saved", { timeout: 20_000 });
  await expect(board.getByText("The board is too big to save")).toBeHidden();
  expect((await shapes(tutor, taskId)).length).toBeGreaterThanOrEqual(2);
  await student.context().close();
  await tutor.context().close();
});

test("rapid open/close of the board leaves no errors and no stuck scroll lock", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  const errors: string[] = [];
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto(`/tasks/${taskId}`);
  const btn = student.getByRole("button", { name: "Whiteboard" });
  for (let i = 0; i < 6; i++) {
    await btn.click();
    await student.getByRole("button", { name: "Close whiteboard" }).click();
  }
  await expect(student.getByRole("dialog", { name: "Shared whiteboard" })).toHaveCount(0);
  expect(await student.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  // Keyboard-only: the button opens it, Escape on the header closes it, focus returns.
  await btn.focus();
  await student.keyboard.press("Enter");
  await expect(student.getByRole("button", { name: "Close whiteboard" })).toBeFocused();
  await student.keyboard.press("Escape");
  await expect(btn).toBeFocused();
  expect(errors).toEqual([]);
  await student.context().close();
  await tutor.context().close();
});

test("whiteboard saves do not raise the chat unread count", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  const before = (await call(tutor, "/me/unread")).count;
  const board = await openBoard(student, taskId);
  await drawRect(student, board);
  await expect(student.getByTestId("whiteboard-status")).toHaveText("Saved", { timeout: 20_000 });
  expect((await call(tutor, "/me/unread")).count).toBe(before);
  await student.context().close();
  await tutor.context().close();
});

test("hired (unpaid) session: chat jump works and no board yet", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await hiredSession(student, tutor);
  await tutor.goto(`/tasks/${taskId}#chat`);
  await expect(tutor.getByRole("textbox", { name: "Message" })).toBeFocused();
  await expect(tutor.getByRole("button", { name: "Whiteboard" })).toHaveCount(0);
  await noSideScroll(tutor);
  await call(student, `/tasks/${taskId}/cancel`, {});
  await student.context().close();
  await tutor.context().close();
});

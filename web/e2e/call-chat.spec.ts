import { expect, test, type Page } from "@playwright/test";

import { call, login, paidSession } from "./session";

// The session chat lives on the call page too: beside the video on wide screens, a sheet on phones.
test.describe.configure({ mode: "serial" });

const isWide = (page: Page) => {
  const v = page.viewportSize()!;
  return v.width >= 768 && v.height >= 560;
};

/** Leave the demo accounts with nothing unread, so other specs' global counts start clean. */
async function markRead(taskId: string, ...people: Page[]) {
  for (const p of people) {
    const c = await call(p, `/tasks/${taskId}/conversation`);
    // 204, no body: call()'s JSON parse is the only thing that fails.
    await call(p, `/conversations/${c.id}/read`, {}).catch((e) => {
      if (!(e instanceof SyntaxError)) throw e;
    });
  }
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openCall(page: Page, taskId: string) {
  await page.goto(`/tasks/${taskId}/call`);
  await expect(page.getByTestId("chat-button")).toBeVisible();
}

async function ensureOpen(page: Page) {
  const btn = page.getByTestId("chat-button");
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

async function ensureClosed(page: Page) {
  const btn = page.getByTestId("chat-button");
  if ((await btn.getAttribute("aria-expanded")) === "true")
    await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
}

test("both people chat from the call page, translated, with an unread badge", async ({
  browser,
  page: initial,
}, info) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  // Before anyone joins the call: chat already works.
  await openCall(student, taskId);
  await openCall(tutor, taskId);
  await ensureClosed(tutor);
  await ensureOpen(student);
  const hello = `Can you see my worksheet? ${Date.now()}`;
  await student.getByRole("textbox", { name: "Message" }).fill(hello);
  await student.getByRole("button", { name: "Send" }).click();
  await expect(student.getByTestId("chat-message").filter({ hasText: hello })).toBeVisible();

  // Tutor, chat closed: badge + a preview line over the video, translated into Spanish.
  await expect(tutor.getByTestId("chat-unread")).toHaveText("1", { timeout: 20_000 });
  await expect(tutor.getByTestId("chat-button")).toHaveAccessibleName("Chat, 1 unread");
  await expect(tutor.getByTestId("chat-toast")).toContainText("[EN→ES]");
  await noSideScroll(tutor);
  await tutor.screenshot({ path: `../artifacts/call-chat/${info.project.name}-unread.png` });

  await tutor.getByTestId("chat-button").click();
  await expect(tutor.getByTestId("chat-message").filter({ hasText: hello })).toContainText("[EN→ES]");
  await expect(tutor.getByTestId("chat-unread")).toHaveCount(0);
  await expect.poll(async () => (await call(tutor, `/tasks/${taskId}`)).unread_count).toBe(0);

  // Join the call, then reply: the student sees it translated into English.
  for (const p of [student, tutor]) {
    if (!isWide(p)) await ensureClosed(p); // the phone sheet sits over the call controls
    await p.getByRole("button", { name: "Join session" }).click();
    await expect(p.getByRole("button", { name: "End session" })).toBeVisible();
  }
  await ensureOpen(tutor);
  const reply = `Sí, lo veo ${Date.now()}`;
  await tutor.getByRole("textbox", { name: "Message" }).fill(reply);
  await tutor.getByRole("button", { name: "Send" }).click();
  if (!isWide(student)) {
    // Phone, sheet closed: the reply shows as a badge first.
    await expect(student.getByTestId("chat-unread")).toHaveText("1", { timeout: 20_000 });
    await ensureOpen(student);
  }
  await expect(student.getByTestId("chat-message").filter({ hasText: reply })).toContainText("[ES→EN]", {
    timeout: 20_000,
  });
  await noSideScroll(student);
  await student.screenshot({ path: `../artifacts/call-chat/${info.project.name}-open.png` });

  // Escape closes the panel and returns focus to the Chat button.
  await student.getByRole("textbox", { name: "Message" }).focus();
  await student.keyboard.press("Escape");
  await expect(student.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  await expect(student.getByTestId("chat-button")).toBeFocused();

  // After End: the chat keeps working.
  if (!isWide(tutor)) await ensureClosed(tutor);
  await tutor.getByRole("button", { name: "End session" }).click();
  await tutor.getByRole("button", { name: "End for both of you" }).click();
  await expect(tutor.getByText("This video session has ended")).toBeVisible();
  await ensureOpen(tutor);
  const after = `Thanks for today ${Date.now()}`;
  await tutor.getByRole("textbox", { name: "Message" }).fill(after);
  await tutor.getByRole("button", { name: "Send" }).click();
  await expect(tutor.getByTestId("chat-message").filter({ hasText: after })).toBeVisible();

  await markRead(taskId, student, tutor);
  await student.context().close();
  await tutor.context().close();
});

test("on a phone the chat is a sheet over the video, portrait and landscape", async ({
  browser,
  page: initial,
}, info) => {
  test.skip(isWide(initial), "phone layout only");
  const viewport = initial.viewportSize()!;
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  await openCall(student, taskId);

  for (const size of [viewport, { width: viewport.height, height: viewport.width }]) {
    await student.setViewportSize(size);
    await ensureOpen(student);
    const sheet = student.getByTestId("chat-sheet");
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    // The video stays on screen above the sheet.
    const video = (await student.getByTestId("local-preview").boundingBox())!;
    expect(video.y).toBeGreaterThanOrEqual(-1);
    expect(video.y + 40).toBeLessThanOrEqual(box.y); // at least the top of the video shows
    const input = student.getByRole("textbox", { name: "Message" });
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport();
    await noSideScroll(student);
    await student.screenshot({
      path: `../artifacts/call-chat/${info.project.name}-sheet-${size.width > size.height ? "landscape" : "portrait"}.png`,
    });
    const text = `typed on a phone ${size.width} ${Date.now()}`;
    await input.fill(text);
    await student.getByRole("button", { name: "Send" }).click();
    await expect(student.getByTestId("chat-message").filter({ hasText: text })).toBeVisible();
    await student.getByRole("button", { name: "Close chat" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(student.getByTestId("chat-button")).toBeFocused();
  }
  await student.setViewportSize(viewport);

  // Opening the whiteboard puts the chat sheet away.
  await ensureOpen(student);
  await student.getByRole("button", { name: "Whiteboard" }).click();
  await expect(student.getByTestId("whiteboard")).toBeVisible();
  await expect(student.getByTestId("chat-sheet")).toHaveCount(0);
  await student.getByRole("button", { name: "Close whiteboard" }).click();

  await markRead(taskId, student, tutor);
  await student.context().close();
  await tutor.context().close();
});

test("someone outside the session gets no call page and no chat", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const outsider = await login(browser, "tutor2@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  await outsider.goto(`/tasks/${taskId}/call`);
  await expect(outsider.getByText("This video session isn't available to you.")).toBeVisible();
  await expect(outsider.getByTestId("chat-button")).toHaveCount(0);
  await expect(outsider.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  for (const p of [student, tutor, outsider]) await p.context().close();
});

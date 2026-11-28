import { expect, test, type Page } from "@playwright/test";
import { call, hiredSession, login } from "./session";

// After a hire, both people get a clear way into the chat, and unread messages show on the desks.
test.describe.configure({ mode: "serial" });

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("a new hire nudges the tutor to message the student, and unread counts follow", async ({
  browser,
  page: initial,
}) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await hiredSession(student, tutor);

  // Tutor desk: a banner for the new hire, linking straight to the chat.
  await tutor.goto("/tutor");
  const banner = tutor.getByTestId("new-hire").filter({ hasText: "You were hired — message Maya" });
  await expect(banner).toBeVisible();
  await noSideScroll(tutor);
  await banner.getByRole("link", { name: "Message Maya" }).click();
  await tutor.waitForURL(new RegExp(`/tasks/${taskId}#chat$`));
  const box = tutor.getByRole("textbox", { name: "Message" });
  await expect(box).toBeFocused();
  await expect(box).toBeInViewport();
  await box.fill("Hi Maya, happy to help!");
  await tutor.getByRole("button", { name: "Send" }).click();
  await expect(tutor.getByTestId("chat-message").filter({ hasText: "Hi Maya" })).toBeVisible();

  // The banner is gone once the chat was opened.
  await tutor.goto("/tutor");
  await expect(tutor.getByRole("heading", { name: "Your sessions" })).toBeVisible();
  await expect(tutor.getByTestId("new-hire").filter({ hasText: "Maya" })).toHaveCount(0);

  // Student desk: the tutor's message is unread; the "Message Diego" link sits by the next step.
  await student.goto("/student");
  const row = student.getByRole("link", { name: /unread message/ }).first();
  await expect(row).toBeVisible();
  await expect(student.getByTestId("nav-unread-dot").first()).toBeAttached();
  await noSideScroll(student);
  const message = student.getByRole("link", { name: /^Message Diego/ });
  await expect(message).toBeVisible();
  await message.click();
  await student.waitForURL(/#chat$/);
  await expect(student.getByRole("textbox", { name: "Message" })).toBeFocused();
  await expect(student.getByTestId("chat-message").filter({ hasText: "Hi Maya" })).toBeVisible();

  // Viewing the chat marked it read.
  await expect.poll(async () => (await call(student, "/me/unread")).count).toBe(0);

  // The student replies; the tutor sees an unread count on that session row.
  await student.getByRole("textbox", { name: "Message" }).fill("Thanks Diego!");
  await student.getByRole("button", { name: "Send" }).click();
  await expect(student.getByTestId("chat-message").filter({ hasText: "Thanks Diego" })).toBeVisible();
  await tutor.goto("/tutor");
  const sessions = tutor.locator("section[aria-labelledby=ses-h]");
  await expect(sessions.getByTestId("unread-count").first()).toBeVisible();
  await noSideScroll(tutor);

  await call(student, `/tasks/${taskId}/cancel`, {}); // leave the demo accounts tidy
  await student.context().close();
  await tutor.context().close();
});

test("on a phone the session page offers a jump to the chat", async ({ browser, page: initial }) => {
  test.skip((initial.viewportSize()?.width ?? 1280) >= 1024, "phone layout only");
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await hiredSession(student, tutor);

  await tutor.goto(`/tasks/${taskId}`);
  const jump = tutor.getByRole("link", { name: "Jump to chat" });
  await expect(jump).toBeVisible();
  await noSideScroll(tutor);
  const box = tutor.getByRole("textbox", { name: "Message" });
  await expect(box).not.toBeInViewport();
  await jump.click();
  await expect(box).toBeFocused();
  await expect(box).toBeInViewport();

  await call(student, `/tasks/${taskId}/cancel`, {});
  await student.context().close();
  await tutor.context().close();
});

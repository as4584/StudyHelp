import { expect, test, type Page } from "@playwright/test";

import { call, login, paidSession } from "./session";

/**
 * Shared whiteboard in a paid session: the student draws, the board saves, the hired tutor gets
 * the same scene, it exports to PNG, fits a phone screen, and closes from the keyboard.
 * Outsiders get no board. Local stack only (the gate runs the fake video provider, so the call
 * page has no live data channel; sync goes through the saved copy).
 */

async function openBoard(page: Page, taskId: string) {
  await page.goto(`/tasks/${taskId}`);
  await page.getByRole("button", { name: "Whiteboard" }).click();
  const board = page.getByRole("dialog", { name: "Shared whiteboard" });
  await expect(board).toBeVisible();
  await expect(board.locator("canvas.interactive")).toBeVisible();
  return board;
}

test("student and tutor share a whiteboard; outsiders cannot", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  const board = await openBoard(student, taskId);
  // Phone width: nothing spills sideways.
  const overflow = await student.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Draw a rectangle.
  const canvas = board.locator("canvas.interactive");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await student.keyboard.press("r");
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height * 0.4;
  await student.mouse.move(x, y);
  await student.mouse.down();
  await student.mouse.move(x + 80, y + 60, { steps: 8 });
  await student.mouse.up();
  await expect(student.getByTestId("whiteboard-status")).toHaveText("Saved", { timeout: 15_000 });
  await expect
    .poll(async () => (await call(tutor, `/tasks/${taskId}/whiteboard`)).version, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  const saved = await call(tutor, `/tasks/${taskId}/whiteboard`);
  expect(saved.scene.elements.some((e: { type: string }) => e.type === "rectangle")).toBeTruthy();

  // Save as image downloads a PNG.
  const download = student.waitForEvent("download");
  await board.getByRole("button", { name: "Save as image" }).click();
  expect((await download).suggestedFilename()).toMatch(/^whiteboard-.*\.png$/);

  // Keyboard close; focus returns to the button that opened it.
  await board.getByRole("button", { name: "Close whiteboard" }).focus();
  await student.keyboard.press("Enter");
  await expect(board).toBeHidden();
  await expect(student.getByRole("button", { name: "Whiteboard" })).toBeFocused();

  // The tutor opens the same board; it survives a reload for the student too.
  await openBoard(tutor, taskId);
  await expect(tutor.getByTestId("whiteboard-status")).toHaveText("Saved");
  await openBoard(student, taskId);
  await student.keyboard.press("Escape"); // Escape from the header (close button has focus) closes
  await expect(student.getByRole("dialog", { name: "Shared whiteboard" })).toBeHidden();

  // Another tutor gets no whiteboard on a session they are not part of.
  const outsider = await login(browser, "tutor2@demo.gsht", viewport);
  await outsider.goto(`/tasks/${taskId}`);
  await expect(outsider.getByRole("button", { name: "Whiteboard" })).toHaveCount(0);
  const res = await outsider.request.get(
    `${process.env.E2E_API_URL ?? "http://127.0.0.1:8000"}/tasks/${taskId}/whiteboard`,
  );
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

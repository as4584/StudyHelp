import { expect, type Page, test } from "@playwright/test";

import { LIVE_VIDEO, login, paidSession } from "./session";

/**
 * Real call through the self-hosted LiveKit SFU (scripts/video-proof starts it): the student
 * and the hired tutor each receive the other's camera, then the student's screen share.
 * Media is Chromium's synthetic camera/mic and an auto-accepted tab capture.
 */

test.skip(!LIVE_VIDEO, "needs the local LiveKit server: run scripts/video-proof");

async function playing(page: Page, testId: string) {
  const v = page.getByTestId(testId).first();
  await expect(v).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
}

test("student and tutor see each other, then the shared screen", async ({ browser, page: initial }, info) => {
  test.skip(info.project.name !== "desktop", "screen sharing is a computer-browser feature");
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  for (const party of [student, tutor]) {
    await party.goto(`/tasks/${taskId}/call`);
    await party.getByRole("button", { name: "Join session" }).click();
    await expect(party.getByRole("button", { name: "End session" })).toBeVisible();
  }
  await playing(student, "remote-camera");
  await playing(tutor, "remote-camera");

  await student.getByRole("button", { name: "Share screen" }).click();
  await expect(student.getByRole("button", { name: "Stop sharing" })).toBeVisible();
  await playing(tutor, "remote-screen");
  await expect(tutor.getByText(/is sharing their screen/)).toBeVisible();

  // Ending from one side closes the room for both.
  await tutor.getByRole("button", { name: "End session" }).click();
  await tutor.getByRole("button", { name: "End for both of you" }).click();
  await expect(tutor.getByText("This video session has ended")).toBeVisible();
  await expect(student.getByText("This video session has ended")).toBeVisible({ timeout: 30_000 });
});

/** Non-white pixels on the board's drawing canvas (Excalidraw keeps no DOM per shape). */
async function inked(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="whiteboard"] canvas')].find(
      (el) => !el.classList.contains("interactive"),
    );
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return -1;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
    return n;
  });
}

test("a shape drawn by one side reaches the other over the LiveKit data channel", async ({
  browser,
  page: initial,
}, info) => {
  test.skip(info.project.name !== "desktop", "one browser engine is enough for the data-channel proof");
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);
  for (const party of [student, tutor]) {
    await party.goto(`/tasks/${taskId}/call`);
    await party.getByRole("button", { name: "Join session" }).click();
    await expect(party.getByRole("button", { name: "End session" })).toBeVisible();
  }
  await playing(tutor, "remote-camera");
  // The student's saves never reach the API: the only way to the tutor is the data channel.
  let puts = 0;
  await student.route("**/tasks/*/whiteboard", (r) => {
    if (r.request().method() !== "PUT") return r.continue();
    puts++;
    return r.abort();
  });
  const boards = [];
  for (const party of [student, tutor]) {
    await party.getByRole("button", { name: "Whiteboard" }).click();
    const b = party.getByRole("dialog", { name: "Shared whiteboard" });
    await expect(b.locator("canvas.interactive")).toBeVisible();
    boards.push(b);
  }
  await tutor.waitForTimeout(500);
  const before = await inked(tutor);
  expect(before).toBeGreaterThanOrEqual(0);

  const canvas = boards[0].locator("canvas.interactive");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.9, y: box.height * 0.9 } });
  await student.keyboard.press("r");
  const t0 = Date.now();
  await student.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await student.mouse.down();
  await student.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6, { steps: 8 });
  await student.mouse.up();
  await expect.poll(() => inked(tutor), { timeout: 5_000, intervals: [100] }).toBeGreaterThan(before + 20);
  console.log(`whiteboard data-channel delivery: ${Date.now() - t0} ms (saved copy blocked: ${puts} PUTs aborted)`);
});

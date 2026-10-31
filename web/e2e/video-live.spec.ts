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
  await expect(tutor.getByText("This video session has ended")).toBeVisible();
  await expect(student.getByText("This video session has ended")).toBeVisible({ timeout: 30_000 });
});

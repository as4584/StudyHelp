import { expect, test } from "@playwright/test";

import { LIVE_VIDEO, login, paidSession } from "./session";

/**
 * Live video entry points. A paid session is set up through the API (the demo loop already
 * covers the UI for posting, bidding, hiring and paying), then both parties open the call.
 * The gate runs the fake video provider, so the call page must say plainly that it is a
 * preview-only demo instead of pretending to connect. With E2E_LIVE_VIDEO=1 (a real LiveKit
 * server, e.g. the hosted demo) the same controls, ending and outsider checks run for real.
 */

test("both parties can open the live session; outsiders cannot", async ({ browser, page: initial }) => {
  const viewport = initial.viewportSize();
  const student = await login(browser, "student@demo.gsht", viewport);
  const tutor = await login(browser, "tutor@demo.gsht", viewport);
  const taskId = await paidSession(student, tutor);

  for (const party of [student, tutor]) {
    await party.goto(`/tasks/${taskId}`);
    const start = party.getByRole("link", { name: "Start video session" });
    await expect(start).toBeVisible();
    await start.click();
    await party.waitForURL(new RegExp(`/tasks/${taskId}/call$`));
    await expect(party.getByTestId("local-preview")).toBeVisible(); // pre-join device preview
    await party.getByRole("button", { name: "Join session" }).click();
    if (LIVE_VIDEO) await expect(party.getByRole("button", { name: "End session" })).toBeVisible();
    else await expect(party.getByText("Demo mode")).toBeVisible();
    await expect(party.getByRole("button", { name: /camera/i })).toBeVisible();
    await expect(party.getByRole("button", { name: /microphone/i })).toBeVisible();
  }

  // Camera toggle works and does not end the session.
  await student.getByRole("button", { name: "Turn camera off" }).click();
  await expect(student.getByRole("button", { name: "Turn camera on" })).toBeVisible();

  // Ending asks first, then closes the call for both sides; a new call can start while the
  // session is still funded.
  await student.getByRole("button", { name: "End session" }).click();
  await student.getByRole("button", { name: "End for both of you" }).click();
  await expect(student.getByText("This video session has ended")).toBeVisible();
  await expect(student.getByRole("button", { name: "Start a new call" })).toBeVisible();
  await tutor.goto(`/tasks/${taskId}`);
  await expect(tutor.getByRole("link", { name: "Start video session" })).toBeVisible();

  // A tutor who is not on this session gets nothing.
  const outsider = await login(browser, "tutor2@demo.gsht", viewport);
  await outsider.goto(`/tasks/${taskId}/call`);
  await expect(outsider.getByText("This video session isn't available to you")).toBeVisible();
});

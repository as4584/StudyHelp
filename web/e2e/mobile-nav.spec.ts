import { expect, test } from "@playwright/test";
import { login } from "./session";

// On phones every workspace tab is visible without scrolling sideways (a horizontal scroller
// used to hide "Tutors" past the screen edge, so students never found the directory).
test("every student tab is on screen on a phone", async ({ browser, page: initial }, info) => {
  test.skip(!["mobile", "iphone", "iphone-se", "android-small"].includes(info.project.name), "phones only");
  const vp = initial.viewportSize()!;
  const page = await login(browser, "student@demo.gsht", vp);
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first();
  for (const name of ["Study desk", "AI tutor", "Ask a tutor", "Tutors"]) {
    const tab = nav.getByRole("link", { name, exact: true });
    await expect(tab).toBeInViewport({ ratio: 1 });
    const box = (await tab.boundingBox())!;
    expect(box.x + box.width, `${name} runs past the screen edge`).toBeLessThanOrEqual(vp.width);
  }
  await nav.getByRole("link", { name: "Tutors", exact: true }).click();
  await page.waitForURL(/\/tutors$/);
  await page.context().close();
});

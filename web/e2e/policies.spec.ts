import { expect, test } from "@playwright/test";

/**
 * Sign-up policies: footer links on every page, a student under 18 signs up with a parent's
 * details, and the desk asks for the parent's consent until it is recorded.
 */
const PASSWORD = "demo-password-123";

function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

test("policies are linked everywhere and a minor needs a parent's consent", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Policies" })
    .getByRole("link", { name: /Student and Parent/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Student and Parent Policy and Terms of Use");

  await page.goto("/signup");
  await page.getByLabel("Email").fill(`e2e-minor-${Date.now()}@demo.gsht`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/onboard$/);

  await page.getByLabel("Display name").fill("Kai");
  await page.getByLabel("Full name").fill("Kai Moana");
  await page.getByLabel("Date of birth").fill(yearsAgo(12));
  await expect(page.getByText("Students must be 13 or older")).toBeVisible();
  await page.getByLabel("Date of birth").fill(yearsAgo(15));
  // Under 18: the parent/guardian fields appear.
  await page.getByLabel("Parent or guardian's full name").fill("Lani Moana");
  await page.getByLabel("Parent or guardian's email").fill("lani@example.com");
  await page.getByRole("checkbox", { name: /I have read and agree to the Student and Parent Policy/ }).check();
  await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled(); // every rule must be ticked
  for (const box of await page
    .getByRole("group", { name: /Check each rule/ })
    .getByRole("checkbox")
    .all())
    await box.check();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL(/\/student$/);

  const gate = page.getByTestId("policy-gate");
  await expect(gate).toContainText("A parent or guardian needs to give consent");
  await expect(gate.getByRole("button", { name: "Record consent" })).toBeDisabled();
  await gate.getByRole("checkbox", { name: /I am this student's parent or guardian/ }).check();
  await gate.getByRole("checkbox", { name: /I have read and agree/ }).check();
  for (const box of await gate
    .getByRole("group", { name: /Check each rule/ })
    .getByRole("checkbox")
    .all())
    await box.check();
  await gate.getByRole("button", { name: "Record consent" }).click();
  await expect(gate).toHaveCount(0);

  // The workspace footer links the policies too.
  await expect(
    page.getByRole("navigation", { name: "Policies" }).getByRole("link", { name: /Tutor Policy/ }),
  ).toBeVisible();
});

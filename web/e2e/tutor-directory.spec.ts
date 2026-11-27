import { expect, test } from "@playwright/test";
import { login } from "./session";

test("a student browses tutors, filters by subject and starts a request", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/student");
  await page.getByRole("link", { name: "Browse tutors" }).click();
  await page.waitForURL(/\/tutors$/);

  const cards = page
    .getByRole("list", { name: "Tutors" })
    .getByRole("listitem")
    .filter({ has: page.locator("h2") });
  await expect(cards.filter({ hasText: "Diego Ramírez" })).toBeVisible();
  await expect(cards.filter({ hasText: "Ravi Kumar" })).toHaveCount(0); // pending applicant
  const diego = cards.filter({ hasText: "Diego Ramírez" });
  await expect(diego.getByText("$18.00")).toBeVisible();
  await expect(diego.getByRole("list", { name: "Subjects" })).toContainText("Calculus");

  // Lowercase search still finds "Calculus".
  await page.getByRole("textbox", { name: "Subject" }).fill("calculus");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(diego).toBeVisible();

  await page.getByRole("textbox", { name: "Subject" }).fill("Underwater basket weaving");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/No tutors list/)).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();

  await diego.getByRole("link", { name: /Request help/ }).click();
  await page.waitForURL(/\/student\/tasks\/new\?subject=/);
  await page.context().close();
});

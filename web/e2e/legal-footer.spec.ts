import { expect, test } from "@playwright/test";
import { login } from "./session";

const EMAIL = "ed@globalstudyhelptutor.com";

test("every page's footer links Terms and Privacy and shows how to reach the business", async ({ page }) => {
  for (const path of ["/", "/login", "/signup", "/policies/student"]) {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: EMAIL })).toHaveAttribute("href", `mailto:${EMAIL}`);
    await expect(footer.getByRole("link", { name: "(551) 239-3476" })).toHaveAttribute("href", "tel:+15512393476");
    await expect(footer.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
  }
});

test("the homepage shows the contact details outside the footer too", async ({ page }) => {
  await page.goto("/");
  const contact = page.getByTestId("home-contact");
  await expect(contact.getByRole("link", { name: EMAIL })).toHaveAttribute("href", `mailto:${EMAIL}`);
  await expect(contact.getByRole("link", { name: "(551) 239-3476" })).toBeVisible();
  // The local stack runs the demo payment adapter, so the demo line is shown.
  await expect(page.getByTestId("payments-mode-note")).toHaveText("Demo build — payments run in test mode");
});

test("/terms and /privacy are real pages reached from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms", exact: true }).click();
  await page.waitForURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Student and Parent Policy and Terms of Use");
  await expect(page.getByTestId("legal-note")).toContainText(/pending attorney review/i);
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
  await page.waitForURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy Policy");
  await expect(page.getByRole("heading", { name: "1. What We Collect" })).toBeVisible();
});

test("a signed-in student sees the contact details in the workspace footer", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/student");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: EMAIL })).toBeVisible();
  await page.context().close();
});

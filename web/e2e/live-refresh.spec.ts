import { expect, test } from "@playwright/test";
import { login } from "./session";

// Both specs share the demo student, so they run one after the other.
test.describe.configure({ mode: "serial" });

test("after upgrading, the desk shows Premium without a reload", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  const upgrade = page.getByRole("button", { name: /Upgrade to Premium/ });
  if (!(await upgrade.isVisible())) {
    // A previous run left Premium on: switch back to free first (this reloads the page).
    await page.getByTestId("demo-cancel-premium").click();
    await expect(upgrade).toBeVisible();
  }
  await upgrade.click();
  await page.getByRole("button", { name: "Pay now" }).click();
  await page.waitForURL(/\/payments\/return/);
  await expect(page.getByRole("heading", { name: "Premium is on." })).toBeVisible();

  // Client-side navigation back to the desk: no page reload happens here.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.getByRole("link", { name: /Back to your desk/ }).click();
  await page.waitForURL(/\/student$/);
  await expect(page.getByText("AI tutor · Premium")).toBeVisible();
  await expect(page.getByTestId("ai-quota")).toContainText("Premium · $9.99/month");
  await expect(upgrade).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // Leave the demo student on the free plan for the other specs.
  await page.getByTestId("demo-cancel-premium").click();
  await expect(upgrade).toBeVisible();
  await page.context().close();
});

test("the AI question counter drops as soon as a question is answered", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  // The server is mocked so this runs whatever today's real allowance is: the quota read says
  // 3 left until a question has been answered, then 2. The page must re-read it on its own.
  let answered = false;
  const quota = (remaining: number) => ({
    premium: false,
    period: "day",
    used: 5 - remaining,
    limit: 5,
    remaining,
    resets_at: "2099-01-01T00:00:00Z",
  });
  await page.route("**/ai/quota", (route) => route.fulfill({ json: quota(answered ? 2 : 3) }));
  await page.route("**/ai/chats", (route) => route.fulfill({ status: 201, json: { id: "chat-1" } }));
  await page.route("**/ai/chats/*/messages", (route) => {
    answered = true;
    return route.fulfill({ json: { id: "reply", role: "assistant", content: "Key idea: subtract 3." } });
  });
  await page.goto("/assistant");
  const counter = page.getByTestId("ai-quota");
  await expect(counter).toContainText("3 of 5 free questions left today");

  await page.getByPlaceholder("Subject (e.g. Calculus)").fill("Algebra");
  await page.getByLabel("Question", { exact: true }).fill("solve 2x + 3 = 17");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("article", { name: "AI tutor answer" })).toBeVisible();
  await expect(counter).toContainText("2 of 5 free questions left today");
  await page.context().close();
});

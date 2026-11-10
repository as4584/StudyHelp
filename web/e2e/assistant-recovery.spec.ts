import { expect, test } from "@playwright/test";
import { login } from "./session";

for (const failure of ["chat", "message"] as const) {
  test(`preserves the question after ${failure} request fails`, async ({ browser, page: initial }) => {
    const page = await login(browser, "student@demo.gsht", initial.viewportSize());
    const question = "Why does the chain rule work?";
    if (failure === "chat") {
      await page.route("**/ai/chats", (route) => route.fulfill({ status: 500, json: { detail: "Chat unavailable" } }));
    } else {
      await page.route("**/ai/chats/*/messages", (route) =>
        route.fulfill({ status: 500, json: { detail: "Tutor unavailable" } }),
      );
    }
    await page.goto("/assistant");
    await page.getByLabel("Question", { exact: true }).fill(question);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(failure === "chat" ? "Chat unavailable" : "Tutor unavailable")).toBeVisible();
    await expect(page.getByLabel("Question", { exact: true })).toHaveValue(question);
    await page.context().close();
  });
}

test("keeps a new draft alongside a failed question", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/ai/chats/*/messages", async (route) => {
    await wait;
    await route.fulfill({ status: 500, json: { detail: "Tutor unavailable" } });
  });
  await page.goto("/assistant");
  const input = page.getByLabel("Question", { exact: true });
  await input.fill("First question");
  const request = page.waitForRequest("**/ai/chats/*/messages");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await request;
  await input.fill("New draft");
  release();
  await expect(page.getByText("Tutor unavailable")).toBeVisible();
  await expect(input).toHaveValue("First question\n\nNew draft");
  await page.context().close();
});

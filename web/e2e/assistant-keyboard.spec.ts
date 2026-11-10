import { expect, test } from "@playwright/test";
import { login } from "./session";

test("Enter preserves the next draft while a question is pending", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/ai/chats/*/messages", async (route) => {
    requests += 1;
    await held;
    await route.fulfill({ json: { id: "reply", role: "assistant", content: "Key idea: Practice." } });
  });
  try {
    await page.goto("/assistant");
    const input = page.getByLabel("Question", { exact: true });
    await input.fill("First question");
    const sent = page.waitForRequest("**/ai/chats/*/messages");
    await input.press("Enter");
    await sent;
    await input.fill("Second question");
    await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
    await input.press("Enter");
    await expect(input).toHaveValue("Second question");
    release();
    await expect(page.getByRole("article", { name: "AI tutor answer" })).toBeVisible();
    expect(requests).toBe(1);
  } finally {
    release();
    await page.context().close();
  }
});

test("Enter does not submit when the AI quota is exhausted", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.route("**/ai/quota", (route) =>
    route.fulfill({
      json: {
        premium: false,
        period: "day",
        used: 5,
        limit: 5,
        remaining: 0,
        resets_at: "2099-01-01T00:00:00Z",
      },
    }),
  );
  let writes = 0;
  await page.route("**/ai/chats", (route) => {
    writes += 1;
    return route.fulfill({ status: 500, json: { detail: "Unexpected write" } });
  });
  await page.goto("/assistant");
  const input = page.getByLabel("Question", { exact: true });
  await input.fill("Save this for tomorrow");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
  await input.press("Enter");
  await expect(input).toHaveValue("Save this for tomorrow");
  expect(writes).toBe(0);
  await page.context().close();
});

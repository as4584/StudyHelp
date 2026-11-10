import { expect, test } from "@playwright/test";
import { LANGUAGE_COOKIE, negotiateLocale, resolveWebsiteLocale } from "../src/lib/locale";
import { login } from "./session";

const catalog = ["en", "es", "fr", "pt", "hi", "ar", "zh-Hans", "zh-Hant"];

test("language precedence: saved, browser, country, English", () => {
  expect(negotiateLocale({ saved: "fr", acceptLanguage: "es", country: "BR" }, catalog)).toBe("fr");
  expect(negotiateLocale({ saved: "xx", acceptLanguage: "es-MX", country: "BR" }, catalog)).toBe("es");
  expect(negotiateLocale({ acceptLanguage: "de", country: "BR" }, catalog)).toBe("pt");
  expect(negotiateLocale({ acceptLanguage: "de", country: "ZZ" }, catalog)).toBe("en");
  expect(negotiateLocale({}, catalog)).toBe("en");
});

test("browser weights, regions, invalid entries and scripts", () => {
  expect(negotiateLocale({ acceptLanguage: "es;q=0.3,fr-CA;q=0.9,en;q=0.7" }, catalog)).toBe("fr");
  expect(negotiateLocale({ acceptLanguage: "fr;q=0,es;q=0.5" }, catalog)).toBe("es");
  expect(negotiateLocale({ acceptLanguage: "fr;q=oops,es;q=2,en;q=0.2" }, catalog)).toBe("en");
  expect(negotiateLocale({ acceptLanguage: "fr;q=0.8,es;q=0.8" }, catalog)).toBe("fr");
  expect(negotiateLocale({ acceptLanguage: "ZH-hANT" }, catalog)).toBe("zh-Hant");
  expect(negotiateLocale({ acceptLanguage: "zh-Hant-TW" }, catalog)).toBe("zh-Hant");
  expect(negotiateLocale({ acceptLanguage: "es;q=0", country: "ES" }, catalog)).toBe("en");
  expect(negotiateLocale({ acceptLanguage: "zh;q=0", country: "TW" }, catalog)).toBe("en");
  expect(negotiateLocale({ acceptLanguage: "*;q=0", country: "FR" }, catalog)).toBe("en");
  expect(negotiateLocale({ acceptLanguage: "zh", country: "TW" }, catalog)).toBe("zh-Hant");
  expect(negotiateLocale({ acceptLanguage: "*", country: "EG" }, catalog)).toBe("ar");
  expect(negotiateLocale({ saved: "<script>", acceptLanguage: "../fr", country: "FR" }, catalog)).toBe("fr");
});

test("launch never selects an untranslated website language", () => {
  for (const language of catalog) {
    expect(resolveWebsiteLocale({ saved: language, acceptLanguage: language, country: "ES" })).toBe("en");
  }
});

test("English initial HTML and no automatically saved preference", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "Accept-Language": "es-MX,es;q=0.9", "x-vercel-ip-country": "ES" });
  const response = await page.goto("/");
  expect(await response!.text()).toMatch(/<html[^>]*lang="en"[^>]*dir="ltr"/);
  await expect(page.getByRole("combobox", { name: "Website language" })).toHaveValue("auto");
  expect((await context.cookies()).find((cookie) => cookie.name === LANGUAGE_COOKIE)).toBeUndefined();
});

test("saved choice survives navigation and reload; Automatic removes it", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Website language" });
  await picker.selectOption("en");
  await expect(picker).toBeEnabled();
  await expect(picker).toHaveValue("en");
  const cookie = (await context.cookies()).find((item) => item.name === LANGUAGE_COOKIE)!;
  expect(cookie).toMatchObject({ value: "en", path: "/", httpOnly: true, sameSite: "Lax", secure: true });
  await page.goto("/login");
  await expect(picker).toHaveValue("en");
  await page.reload();
  await expect(picker).toHaveValue("en");
  const other = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await expect(otherPage.getByRole("combobox", { name: "Website language" })).toHaveValue("auto");
  } finally {
    await other.close();
  }
  await picker.selectOption("auto");
  await expect(picker).toBeEnabled();
  await expect(picker).toHaveValue("auto");
  expect((await context.cookies()).find((item) => item.name === LANGUAGE_COOKIE)).toBeUndefined();
  await page.reload();
  await expect(picker).toHaveValue("auto");
});

test("tampered preference is ignored and a failed save can be retried", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: LANGUAGE_COOKIE, value: "unsupported", url: baseURL! }]);
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Website language" });
  await expect(picker).toHaveValue("auto");
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort();
    else await route.continue();
  });
  await picker.selectOption("en");
  const error = page.getByRole("alert").filter({ hasText: "Could not save your language" });
  await expect(error).toBeVisible();
  await expect(picker).toBeEnabled();
  await expect(picker).toHaveValue("auto");
  await page.unrouteAll({ behavior: "wait" });
  await picker.selectOption("en");
  await expect(picker).toHaveValue("en");
  await expect(error).toHaveCount(0);
});

test("signed-in workspace can save its website preference without signing out", async ({ browser }, testInfo) => {
  const page = await login(browser, "student@demo.gsht", testInfo.project.use.viewport ?? null);
  try {
    const picker = page.getByRole("combobox", { name: "Website language" });
    await picker.selectOption("en");
    await expect(picker).toHaveValue("en");
    await page.reload();
    await expect(picker).toHaveValue("en");
    await expect(page.getByTestId("whoami")).toContainText("Maya");
  } finally {
    await page.context().close();
  }
});

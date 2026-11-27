import { expect, test } from "@playwright/test";

// Things a production site needs that no user flow walks: a friendly 404, robots rules that
// keep signed-in areas out of search results, a sitemap of the public pages, and HTTPS-only
// and anti-framing headers on every page.

test("a wrong link shows a friendly page with a way back", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Home", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("robots keeps signed-in areas out of search and points to the sitemap", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  for (const p of ["/admin", "/student", "/tasks", "/tutor", "/checkout"]) expect(robots).toContain(`Disallow: ${p}`);
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const p of ["/terms", "/privacy", "/login"]) expect(sitemap).toContain(p);
  expect(sitemap).not.toContain("/admin");
});

test("every page is HTTPS-only and can't be framed", async ({ request }) => {
  for (const p of ["/", "/login", "/terms"]) {
    const h = (await request.get(p)).headers();
    expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  }
});

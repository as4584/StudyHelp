import { defineConfig, devices } from "@playwright/test";

// Synthetic camera/mic so the video pages run headless in CI without real devices.
const CHROMIUM_MEDIA = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--auto-accept-this-tab-capture", // screen share picker -> this tab, no prompt
];

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "../artifacts/playwright",
  reporter: [["list"], ["html", { outputFolder: "../artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // desktop, mobile and iphone run everywhere (CI included). E2E_DEVICES=all adds the browsers real
  // students use that Chromium can't stand in for: Safari on iPhone/iPad, Firefox, a small phone.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { args: CHROMIUM_MEDIA } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { args: CHROMIUM_MEDIA } } },
    // Most students are on iPhones, and Safari is not Chromium: always run it.
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    ...(process.env.E2E_DEVICES === "all"
      ? [
          { name: "iphone-se", use: { ...devices["iPhone SE (3rd gen)"] } },
          { name: "ipad", use: { ...devices["iPad Pro 11"] } },
          { name: "iphone-landscape", use: { ...devices["iPhone 15 landscape"] } },
          { name: "android-small", use: { ...devices["Galaxy S9+"], launchOptions: { args: CHROMIUM_MEDIA } } },
          { name: "mac-safari", use: { ...devices["Desktop Safari"] } },
          {
            name: "edge",
            use: { ...devices["Desktop Edge"], channel: "msedge", launchOptions: { args: CHROMIUM_MEDIA } },
          },
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              launchOptions: {
                firefoxUserPrefs: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true },
              },
            },
          },
        ]
      : []),
  ],
});

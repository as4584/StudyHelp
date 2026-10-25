// Contact sheet: every screen of a capture round, desktop beside mobile, in demo-flow order.
// Usage: node design/contact.mjs <label>  →  ../artifacts/design/<label>/contact-sheet.png
import { chromium } from "@playwright/test";
import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const label = process.argv[2] ?? "current";
const dir = resolve(`../artifacts/design/${label}`);
const screens = [
  ...new Set(
    readdirSync(dir)
      .filter((f) => /-1440\.png$/.test(f))
      .map((f) => f.replace(/-1440\.png$/, "")),
  ),
].sort();

const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:40px;background:#efede7;font:14px system-ui;color:#14161b}
  h1{font:600 22px Georgia,serif;margin:0 0 24px}
  .row{display:grid;grid-template-columns:900px 244px;gap:24px;align-items:start;margin-bottom:40px}
  .cap{grid-column:1/-1;font-weight:600;margin-bottom:-12px}
  img{width:100%;max-height:1400px;object-fit:cover;object-position:top;border:1px solid #cfcbc1;border-radius:6px;background:#fff}
</style><h1>StudyHelp · ${label} · desktop 1440 / mobile 390</h1>
${screens
  .map(
    (s) => `<div class="row"><div class="cap">${s}</div>
  <img src="file:///${dir.replace(/\\/g, "/")}/${s}-1440.png"><img src="file:///${dir.replace(/\\/g, "/")}/${s}-390.png"></div>`,
  )
  .join("")}`;
const htmlPath = `${dir}/contact-sheet.html`;
writeFileSync(htmlPath, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1250, height: 900 } });
await p.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
await p.waitForLoadState("load");
await p.screenshot({ path: `${dir}/contact-sheet.png`, fullPage: true });
await b.close();
console.log(`contact sheet: ${dir}/contact-sheet.png (${screens.length} screens)`);

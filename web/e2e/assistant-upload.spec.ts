import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { login } from "./session";

/** One-page PDF with a real text layer, so the server reads it without any model. */
function textPdf(line: string): Buffer {
  const ops = deflateSync(Buffer.from(`BT /F1 12 Tf 72 720 Td (${line}) Tj ET`));
  const objs = [
    Buffer.from("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"),
    Buffer.from("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"),
    Buffer.from(
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
        "/Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    ),
    Buffer.concat([
      Buffer.from(`4 0 obj << /Length ${ops.length} /Filter /FlateDecode >> stream\n`),
      ops,
      Buffer.from("\nendstream endobj\n"),
    ]),
    Buffer.from("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"),
  ];
  let out = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(out.length);
    out = Buffer.concat([out, o]);
  }
  const xref = out.length;
  const table = offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.concat([
    out,
    Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${table}`),
    Buffer.from(`trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`),
  ]);
}

test("a homework PDF becomes the question, and the math gets checked", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/assistant");
  const box = page.getByLabel("Question", { exact: true });
  await box.fill("My teacher gave me this:");
  await page
    .getByRole("main")
    .locator("input[type=file]")
    .setInputFiles({
      name: "hw.pdf",
      mimeType: "application/pdf",
      buffer: textPdf("Solve for x: 2x + 6 = 20"),
    });
  // The read text is added under the student's draft, not over it.
  await expect(box).toHaveValue(/My teacher gave me this:\s+Solve for x: 2x \+ 6 = 20/);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Checked answer")).toBeVisible();
  await expect(page.getByText(/2x \+ 6 = 20 gives x = 7/)).toBeVisible();
  await page.context().close();
});

test("a file that is not a photo or PDF is refused with a clear message", async ({ browser, page: initial }) => {
  const page = await login(browser, "student@demo.gsht", initial.viewportSize());
  await page.goto("/assistant");
  await page
    .getByRole("main")
    .locator("input[type=file]")
    .setInputFiles({
      name: "homework.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("MZ\x90\x00 definitely not a pdf"),
    });
  await expect(page.getByText(/upload a photo \(JPG, PNG, WebP\) or a PDF/)).toBeVisible();
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue("");
  await page.context().close();
});

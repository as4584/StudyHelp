import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, test } from "@playwright/test";

// Exercise the production client with only authentication and transport replaced.
// No real requests or credentials are used.
type Step = number | "network" | "timeout" | `html${number}`;

function client(sequence: Step[]) {
  let calls = 0;
  const exports: { api?: (path: string, init?: { method: string }) => Promise<unknown> } = {};
  const source = readFileSync(resolve("src/lib/api.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports,
    process: { env: {} },
    AbortSignal,
    require: () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }),
    fetch: async () => {
      const status = sequence[calls++];
      if (status === "network") throw new TypeError("Failed to fetch");
      if (status === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (status === undefined) throw new Error("unexpected extra request");
      if (typeof status === "string")
        return new Response("<html>Gateway error</html>", {
          status: Number(status.slice(4)),
          statusText: "Internal Server Error",
        });
      return new Response(JSON.stringify({ detail: "unavailable" }), { status });
    },
  });
  return { api: async (path: string, init?: { method: string }) => await exports.api!(path, init), calls: () => calls };
}

test("503 then network failure consumes exactly one GET retry", async () => {
  const c = client([503, "network", 200]);
  await expect(c.api("/test")).rejects.toMatchObject({ status: 0 });
  expect(c.calls()).toBe(2);
});

for (const first of [502, 503, 504, "network"] as const) {
  test(`GET recovers from ${first} with one retry`, async () => {
    const c = client([first, 200]);
    await expect(c.api("/test")).resolves.toEqual({ detail: "unavailable" });
    expect(c.calls()).toBe(2);
  });
}

test("GET preserves a final HTTP error and does not retry client errors", async () => {
  for (const statuses of [[503, 503], [403]]) {
    const c = client(statuses);
    await expect(c.api("/test")).rejects.toMatchObject({ status: statuses.at(-1) });
    expect(c.calls()).toBe(statuses.length);
  }
});

test("writes never retry HTTP or network failures", async () => {
  for (const first of [503, "network"] as const) {
    const c = client([first, 200]);
    await expect(c.api("/test", { method: "POST" })).rejects.toMatchObject({ status: first === "network" ? 0 : first });
    expect(c.calls()).toBe(1);
  }
});

// What a student reads when the platform, not the app, answers: never raw status text.
test("errors read as plain language: offline, too slow, platform error pages", async () => {
  const cases: [Step, RegExp][] = [
    ["network", /couldn't reach StudyHelp/],
    ["timeout", /took too long/],
    ["html500", /went wrong on our side/],
    ["html504", /temporarily unavailable/],
  ];
  for (const [step, message] of cases) {
    const c = client([step]);
    const err = await c.api("/test", { method: "POST" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(message);
    expect((err as Error).message).not.toMatch(/Internal Server Error/);
  }
});

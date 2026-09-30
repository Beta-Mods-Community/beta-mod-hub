import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual action bodies with inert dependencies. No database,
// Next request context, provider credential or network connection is loaded.
const source = readFileSync(new URL("../lib/requirements.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function actions({ denied = false, writeFails = false } = {}) {
  const events: string[] = [];
  const betaModId = "fixture-mod";
  class Redirect extends Error {
    constructor(public path: string) { super("redirect"); }
  }
  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (path: string) => { events.push(`redirect:${path}`); throw new Redirect(path); } },
    "next/cache": { revalidatePath: (path: string) => events.push(`revalidate:${path}`) },
    "drizzle-orm": { eq: () => ({}) },
    "./db": { db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ betaModId }] }) }) }),
      transaction: async (work: (tx: unknown) => Promise<void>) => {
        events.push("transaction:start");
        if (writeFails) throw new Error("simulated write failure");
        await work({
          insert: () => ({ values: async () => { events.push("insert"); } }),
          delete: () => ({ where: async () => { events.push("delete"); } }),
        });
        events.push("transaction:committed");
      },
    } },
    "./dal": { verifySession: async () => ({ userId: "fixture-owner" }) },
    "../db/schema": { requirements: { betaModId: {}, id: {} } },
    "./definitions": { RequirementFormSchema: { safeParse: (data: unknown) => ({ success: true, data }) } },
    "./mod-lifecycle": {
      lockModForMutation: async () => ({}),
      assertEditableMod: () => {},
      mutationMessage: () => "Unable to save.",
    },
    "./access": { getAccountWriteError: async () => denied ? "Account is restricted." : undefined },
  };
  const exported: {
    addRequirement?: (data: FormData) => Promise<void>;
    removeRequirement?: (id: string) => Promise<void>;
  } = {};
  runInNewContext(compiled, {
    exports: exported,
    URL,
    require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected real dependency: ${name}`);
      return modules[name];
    },
  });
  async function run(kind: "add" | "remove") {
    const data = new FormData();
    data.set("betaModId", betaModId);
    data.set("nexusModName", "A dependency");
    data.set("nexusModUrl", "");
    await assert.rejects(kind === "add" ? exported.addRequirement!(data) : exported.removeRequirement!("fixture-requirement"), error => error instanceof Redirect);
    return events;
  }
  return { run };
}

test("requirement add/remove invalidate the mod page after commit and before same-page redirect", async () => {
  for (const kind of ["add", "remove"] as const) {
    const { run } = actions();
    assert.deepEqual(await run(kind), [
      "transaction:start",
      kind === "add" ? "insert" : "delete",
      "transaction:committed",
      "revalidate:/mods/fixture-mod",
      "redirect:/mods/fixture-mod#requirements",
    ]);
  }
});

test("a failed requirement mutation does not invalidate as if it succeeded", async () => {
  for (const kind of ["add", "remove"] as const) {
    const { run } = actions({ writeFails: true });
    assert.deepEqual(await run(kind), [
      "transaction:start",
      "redirect:/mods/fixture-mod?feedback=Unable%20to%20save.#requirements",
    ]);
  }
});

test("account denial does not write or invalidate requirements", async () => {
  for (const kind of ["add", "remove"] as const) {
    const { run } = actions({ denied: true });
    const events = await run(kind);
    assert.equal(events.length, 1);
    assert.match(events[0], /^redirect:\/mods\/fixture-mod\?feedback=Account%20is%20restricted\./);
  }
});

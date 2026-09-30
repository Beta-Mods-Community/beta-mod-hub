import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseImageMemoryArgs, assertImageMemoryEnvironment, validateImageMemoryManifest,
  IMAGE_MEMORY_LIMITS, IMAGE_MEMORY_INPUT_HASHES } from "../scripts/cloud-image-memory-rehearsal.mjs";

const manifest = () => ({ version: 1, fixtures: IMAGE_MEMORY_INPUT_HASHES.map((sha256: string, index: number) => ({
  filename: `boundary-image-${index + 1}.webp`, sha256, bytes: 7000000, canonicalBytes: 6500000,
  canonicalSha256: "a".repeat(64), width: 2048, height: 2048,
})) });

test("image-memory CLI is inert by default and accepts only explicit absolute offline directories", () => {
  assert.deepEqual(parseImageMemoryArgs([]), { mode: "help" });
  assert.deepEqual(parseImageMemoryArgs(["--help"]), { mode: "help" });
  const directory = path.resolve("synthetic-unused-directory");
  for (const mode of ["prepare", "measure"]) assert.deepEqual(parseImageMemoryArgs([`--${mode}`, directory]), { mode, directory });
  for (const args of [["--live"], ["--measure", "relative"], ["--prepare"], ["--measure", directory, "--secret=x"]]) assert.throws(() => parseImageMemoryArgs(args));
});

test("allocator rehearsal rejects provider credentials and noncomparable allocator settings", () => {
  assert.doesNotThrow(() => assertImageMemoryEnvironment({ CLOUD_PILOT: "on" }));
  assert.doesNotThrow(() => assertImageMemoryEnvironment({ CLOUD_PILOT: "on", MALLOC_ARENA_MAX: "2" }));
  for (const key of ["DATABASE_URL", "SESSION_SECRET", "STORAGE_SECRET_KEY", "TRANSLOADIT_KEY", "BACKUP_ENCRYPTION_KEY", "GITHUB_TOKEN", "ACTIONS_RUNTIME_TOKEN"]) {
    assert.throws(() => assertImageMemoryEnvironment({ CLOUD_PILOT: "on", [key]: "synthetic-not-a-secret" }));
  }
  assert.throws(() => assertImageMemoryEnvironment({}));
  assert.throws(() => assertImageMemoryEnvironment({ CLOUD_PILOT: "on", MALLOC_ARENA_MAX: "4" }));
});

test("manifest pins the exact three full4MP inputs and bounded canonical outputs", () => {
  assert.deepEqual(validateImageMemoryManifest(manifest()), manifest());
  for (const change of [
    { filename: "../../.env.local" }, { sha256: "b".repeat(64) }, { width: 2047 },
    { bytes: IMAGE_MEMORY_LIMITS.bytes + 1 }, { canonicalBytes: 0 }, { canonicalSha256: "wrong" },
  ]) {
    const value = manifest(); Object.assign(value.fixtures[0], change);
    assert.throws(() => validateImageMemoryManifest(value));
  }
  const short = manifest(); short.fixtures.pop();
  assert.throws(() => validateImageMemoryManifest(short));
  assert.equal(IMAGE_MEMORY_LIMITS.repeats, 6);
  assert.equal(IMAGE_MEMORY_LIMITS.memory, 536870912);
  assert.equal(IMAGE_MEMORY_LIMITS.appHeadroomBytes, 134217728);
});

test("manual Linux workflow enforces the real resource boundary without credentials or provider network", () => {
  const source = readFileSync(path.join(process.cwd(), ".github/workflows/cloud-image-memory.yml"), "utf8");
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /github\.repository == 'Beta-Mods-Community\/beta-mod-hub'/);
  assert.doesNotMatch(source, /github\.event\.repository\.private/);
  assert.doesNotMatch(source, /\b(?:schedule|pull_request|push):|secrets\.|upload-artifact|download-artifact/);
  assert.match(source, /permissions:\s+contents: read/);
  assert.match(source, /timeout-minutes: 15/);
  assert.match(source, /--network none --read-only --memory 512m --memory-swap 512m/);
  assert.match(source, /--cpus 1 --pids-limit 64/);
  assert.match(source, /--env MALLOC_ARENA_MAX=2/);
  assert.match(source, /for variant in default arena2/);
  assert.match(source, /env -i PATH="\$PATH" CLOUD_PILOT=on/);
  assert.match(source, /OOMKilled/);
});

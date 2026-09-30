import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("Node version declarations agree with the supported runtime", () => {
  const manifest = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(manifest.engines.node, "22.x");
  assert.equal(lock.packages[""].engines.node, manifest.engines.node);
  assert.equal(read(".nvmrc").trim(), "22");
});

test("Docker context excludes private configuration and operator artifacts", () => {
  const patterns = new Set(read(".dockerignore").split(/\r?\n/).map(line => line.trim()));
  for (const pattern of [".env*", ".git", ".local-notes", ".release-audit", "backups",
    "data", "*.pem", "*.key", "*.p12", "*.pfx", "*.bmbak", "github-recovery-codes.txt"]) {
    assert.ok(patterns.has(pattern), `Missing Docker context exclusion: ${pattern}`);
  }
});

test("Compose image includes the policy imported by its runtime config", () => {
  assert.match(read("next.config.ts"), /from "\.\/lib\/pilot"/);
  assert.match(read("Dockerfile"), /COPY --from=build \/app\/lib\/pilot\.ts \.\/lib\/pilot\.ts/);
});

test("offline image benchmark remains manual and needs no private repository", () => {
  const workflow = read(".github/workflows/cloud-image-memory.yml").replace(/^\s*#.*$/gm, "");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /--network none/);
  assert.doesNotMatch(workflow, /github\.event\.repository\.private|secrets\.|pull_request_target|self-hosted/);
});

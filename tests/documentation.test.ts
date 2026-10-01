import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("contributor documentation links resolve within the repository", () => {
  const pending = ["README.md"];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const name = pending.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);

    const source = readFileSync(path.join(root, name), "utf8");
    for (const [, destination] of source.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;
      const file = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
      const target = path.resolve(root, path.dirname(name), file);
      const relative = path.relative(root, target);
      assert.ok(
        !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`),
        `${name}: link leaves the repository`,
      );
      assert.ok(existsSync(target), `${name}: missing link target ${destination}`);
      if (path.extname(target) === ".md") pending.push(relative);
    }
  }

  assert.ok(visited.has("CONTRIBUTING.md"));
  assert.ok(visited.has(path.join("docs", "ARCHITECTURE.md")));
  assert.ok(visited.has(path.join("scripts", "README.md")));
});

test("the script inventory documents every executable helper", () => {
  const inventory = readFileSync(path.join(root, "scripts", "README.md"), "utf8");
  const scripts = readdirSync(path.join(root, "scripts"), { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:mjs|ps1)$/.test(entry.name))
    .map(entry => entry.name);

  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.ok(inventory.includes(`\`${script}\``), `Document ${script} and its side effects in scripts/README.md`);
  }
});

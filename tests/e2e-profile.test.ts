import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

// Evaluate only the real read-only HTML assertion, never the dev entry point.
const source = readFileSync(new URL("../scripts/e2e-profile.mjs", import.meta.url), "utf8");
const start = source.indexOf("const reporterBadges =");
const end = source.indexOf(";", start);
assert.ok(start >= 0 && end > start, "Profile rehearsal counts reporter badges");
const expression = `${source.slice(start, end + 1)} reporterBadges;`;

test("profile rehearsal recognizes the rendered SVG reputation badges", () => {
  // Normal React is needed for client components; no actions or DB imports.
  const html = execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const Badge = require("./src/components/reputation-badge").default;
    process.stdout.write([0, 12].map(score =>
      renderToStaticMarkup(React.createElement(Badge, { score }))).join(""));
  `], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000,
    env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    windowsHide: true,
  });
  assert.equal(runInNewContext(expression, { modHtml: html }), 2);
  assert.equal(runInNewContext(expression, { modHtml: "<p>A report with decorative ★ ★ text</p>" }), 0);
});

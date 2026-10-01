import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Render presentation only under normal React; the suite itself uses react-server.
// No actions, routes, database clients or environment files are loaded.
const rendered: Record<string, string> = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const VerdictBadge = require("./src/components/verdict-badge").default;
  const output = {};
  for (const isCurrentBuild of [true, false]) {
    for (const ready of [true, false]) {
      output[isCurrentBuild + ":" + ready] = renderToStaticMarkup(React.createElement(VerdictBadge, { isCurrentBuild, ready }));
    }
  }
  process.stdout.write(JSON.stringify(output));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

test("current verdicts distinguish readiness and explain their limits", () => {
  assert.match(rendered["true:true"], />Ready<\/button>/);
  assert.match(rendered["true:true"], /not a guarantee of compatibility/);
  assert.match(rendered["true:false"], />Not ready<\/button>/);
  assert.match(rendered["true:false"], /needing more work before release/);
  assert.match(rendered["true:false"], /A bug report can help the author/);
});

test("an earlier-build vote never appears as a current ready or not-ready verdict", () => {
  for (const ready of [true, false]) {
    const html = rendered[`false:${ready}`];
    assert.match(html, />Retest needed<\/button>/);
    assert.match(html, /does not count toward the current build/);
    assert.doesNotMatch(html, />Ready<\/button>|>Not ready<\/button>/);
  }
});

test("verdict help remains a non-submitting, named control with decorative icons", () => {
  for (const html of Object.values(rendered)) {
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
    assert.match(html, /<button type="button"/);
    assert.match(html, /aria-label="About [^"]+ verdict"/);
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(descriptionId);
    assert.ok(html.includes(`id="${descriptionId}"`));
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.doesNotMatch(html, /<form\b|type="submit"/);
  }
});

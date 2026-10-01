import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

type BadgeRender = { kind: string; value: string; html: string };

// Lucide requires normal React, while the main suite uses the server condition.
// Render these pure components in isolation; no actions or database are loaded.
const { badges: rendered, heading }: { badges: BadgeRender[]; heading: string } = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const components = [
    ["release", require("./src/components/status-badge").default, "status", ["alpha", "beta", "rc", "promoted", "abandoned"]],
    ["severity", require("./src/components/severity-badge").default, "severity", ["minor", "major", "blocking"]],
    ["report", require("./src/components/report-status-badge").default, "status", ["open", "acknowledged", "fixed"]],
  ];
  const rows = components.flatMap(([kind, Component, prop, values]) =>
    [...values, "unknown", "constructor", "__proto__"].map(value => ({
      kind, value, html: renderToStaticMarkup(React.createElement(Component, { [prop]: value })),
    })));
  const SectionHeading = require("./src/components/section-heading").default;
  const heading = renderToStaticMarkup(React.createElement(SectionHeading, {
    title: "Bug reports", id: "bugs-heading", icon: require("lucide-react").Bug,
  }));
  process.stdout.write(JSON.stringify({ badges: rows, heading }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

function badge(kind: string, value: string) {
  const row = rendered.find(item => item.kind === kind && item.value === value);
  assert.ok(row, `Missing ${kind} badge for ${value}`);
  return row.html;
}

test("semantic section icons preserve the named heading and remain noninteractive", () => {
  assert.match(heading, /^<h2 id="bugs-heading"/);
  assert.equal(heading.replace(/<[^>]+>/g, ""), "Bug reports");
  assert.match(heading, /lucide-bug/);
  assert.match(heading, /<svg[^>]*aria-hidden="true"/);
  assert.match(heading, /<svg[^>]*focusable="false"/);
  assert.doesNotMatch(heading, /<(?:button|a)\b|tabindex=|role=/);
});

test("badge icons preserve readable state labels and stay decorative", () => {
  for (const { value, html } of rendered) {
    assert.equal(html.replace(/<[^>]+>/g, ""), value);
    assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /<svg[^>]*focusable="false"/);
    assert.match(html, /<svg[^>]*stroke="currentColor"/);
    assert.match(html, /<svg[^>]*stroke-width="1\.8"/);
    assert.match(html, /<svg[^>]*class="[^"]*h-3 w-3 shrink-0/);
    assert.match(html, /^<span class="inline-flex items-center gap-1\.5 whitespace-nowrap/);
    assert.doesNotMatch(html, /aria-label=|role="(?:button|img)"|tabindex=|lucide-shield/);
  }
});

test("release, severity and report states use distinct pictograms with their existing colors", () => {
  const expected = [
    ["release", "alpha", "flask-conical", "text-amber-200"],
    ["release", "beta", "test-tube-diagonal", "text-accent-strong"],
    ["release", "rc", "flag", "text-violet-200"],
    ["release", "promoted", "external-link", "text-emerald-200"],
    ["release", "abandoned", "archive", "text-zinc-400"],
    ["severity", "minor", "info", "text-zinc-300"],
    ["severity", "major", "triangle-alert", "text-amber-200"],
    ["severity", "blocking", "octagon-alert", "text-red-200"],
    ["report", "open", "circle-dot", "text-red-300"],
    ["report", "acknowledged", "eye", "text-amber-300"],
    ["report", "fixed", "circle-check", "text-emerald-300"],
  ];
  for (const [kind, value, icon, color] of expected) {
    const html = badge(kind, value);
    assert.ok(html.includes(`lucide-${icon}`), `Wrong icon for ${kind} ${value}`);
    assert.ok(html.includes(color), `Changed color for ${kind} ${value}`);
  }
});

test("unknown states retain their labels and use neutral help icons", () => {
  for (const kind of ["release", "severity", "report"]) {
    for (const value of ["unknown", "constructor", "__proto__"]) {
      const html = badge(kind, value);
      assert.match(html, /lucide-circle-(?:help|question-mark)/);
      assert.match(html, /text-zinc-(?:300|400)/);
      assert.doesNotMatch(html, /text-(?:emerald|red|amber)|lucide-(?:circle-check|flag|external-link)/);
    }
  }
});

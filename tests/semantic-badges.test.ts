import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

type BadgeRender = { kind: string; value: string; html: string };
type RenderedComponents = {
  badges: BadgeRender[];
  reputation: { score: number; html: string }[];
  heading: string;
  explainedHeading: string;
  passiveBadge: string;
  modCard: string;
};

// Lucide requires normal React, while the main suite uses the server condition.
// Render these components in isolation; no actions or database are loaded.
const { badges: rendered, reputation, heading, explainedHeading, passiveBadge, modCard }: RenderedComponents = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
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
  const explainedHeading = renderToStaticMarkup(React.createElement(SectionHeading, {
    title: "Bug reports", id: "explained-bugs-heading", icon: require("lucide-react").Bug,
    description: "Read and respond to problems found in a specific build.",
  }));
  const ReputationBadge = require("./src/components/reputation-badge").default;
  const reputation = [0, 4, 12, 25].map(score => ({
    score, html: renderToStaticMarkup(React.createElement(ReputationBadge, { score })),
  }));
  const StatusBadge = require("./src/components/status-badge").default;
  const passiveBadge = renderToStaticMarkup(React.createElement(StatusBadge, { status: "beta", explain: false }));
  const ModCard = require("./src/components/mod-card").default;
  const modCard = renderToStaticMarkup(React.createElement(ModCard, { mod: {
    id: "example-mod", title: "Example mod", description: "A test listing.", game: "Example game",
    tags: [], status: "beta", ownerName: "Example author", createdAt: "2026-09-30",
    updatedAt: "2026-09-30", testerCount: 0, openBugs: 0, ready: 0, total: 0, buildCount: 0, lastBuildAt: null,
  } }));
  process.stdout.write(JSON.stringify({ badges: rows, reputation, heading, explainedHeading, passiveBadge, modCard }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

function badge(kind: string, value: string) {
  const row = rendered.find(item => item.kind === kind && item.value === value);
  assert.ok(row, `Missing ${kind} badge for ${value}`);
  return row.html;
}

function helpTrigger(html: string) {
  const match = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/);
  assert.ok(match, "Missing help trigger");
  return match[0];
}

test("semantic section icons preserve the named heading and remain noninteractive", () => {
  assert.match(heading, /^<h2 id="bugs-heading"/);
  assert.equal(heading.replace(/<[^>]+>/g, ""), "Bug reports");
  assert.match(heading, /lucide-bug/);
  assert.match(heading, /<svg[^>]*aria-hidden="true"/);
  assert.match(heading, /<svg[^>]*focusable="false"/);
  assert.doesNotMatch(heading, /<(?:button|a)\b|tabindex=|role=/);
});

test("section help keeps a named icon control alongside the visible heading", () => {
  const trigger = helpTrigger(explainedHeading);
  assert.match(explainedHeading, /^<h2 id="explained-bugs-heading"/);
  assert.match(explainedHeading, /<span>Bug reports<\/span><\/h2>$/);
  assert.match(trigger, /aria-label="[^"]*Bug reports[^"]*"/);
  assert.match(trigger, /<svg[^>]*aria-hidden="true"/);
  assert.match(trigger, /<svg[^>]*focusable="false"/);
  assert.match(explainedHeading, /Read and respond to problems found in a specific build\./);
});

test("badge icons preserve readable state labels and stay decorative", () => {
  for (const { kind, value, html } of rendered) {
    const trigger = helpTrigger(html);
    assert.equal(trigger.replace(/<[^>]+>/g, ""), value);
    assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.match(html, /<svg[^>]*focusable="false"/);
    assert.match(html, /<svg[^>]*stroke="currentColor"/);
    if (kind === "release") {
      assert.match(html, /<svg[^>]*stroke-width="2"/);
      assert.match(html, /<svg[^>]*class="[^"]*h-5 w-5 shrink-0/);
      assert.match(trigger, /class="[^"]*inline-flex items-center gap-2 whitespace-nowrap/);
      assert.match(trigger, /\bmin-h-8\b/);
      assert.match(trigger, /\btext-sm\b/);
    } else {
      assert.match(html, /<svg[^>]*stroke-width="1\.8"/);
      assert.match(html, /<svg[^>]*class="[^"]*h-3 w-3 shrink-0/);
      assert.match(trigger, /class="[^"]*inline-flex items-center gap-1\.5 whitespace-nowrap/);
    }
    assert.match(trigger, /type="button"/);
    assert.ok(trigger.includes(`aria-label="About ${value} `));
    assert.doesNotMatch(html, /title=|role="(?:button|img)"|tabindex=|lucide-shield/);
    assert.doesNotMatch(html.match(/<svg\b[^>]*>/)?.[0] ?? "", /aria-label=|role=|tabindex=/);
  }
});

test("badge help associates each trigger with its explanation without putting popup text in the button", () => {
  for (const { html } of rendered) {
    const trigger = helpTrigger(html);
    const descriptionId = trigger.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(descriptionId, "Missing accessible description");
    assert.equal(trigger.match(/popovertarget="([^"]+)"/i)?.[1], descriptionId);
    assert.ok(html.includes(`id="${descriptionId}"`));
    assert.match(html, /<span[^>]*popover="auto"[^>]*role="tooltip"/);
    assert.doesNotMatch(trigger, /role="tooltip"/);
    assert.doesNotMatch(html, /—/);
  }
  assert.match(badge("release", "rc"), /Release candidate/);
  assert.match(badge("release", "promoted"), /beta page is read-only/);
  assert.match(badge("severity", "blocking"), /prevents playing or testing/);
  assert.match(badge("report", "fixed"), /author has marked this issue fixed/);
  assert.match(badge("report", "fixed"), /reporter can test the requested build/);
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
      assert.match(html, /this view does not recognize/);
      assert.doesNotMatch(html, /text-(?:emerald|red|amber)|lucide-(?:circle-check|flag|external-link)/);
    }
  }
});

test("reputation exposes the tier and participation meaning through accessible help", () => {
  const tiers = ["New Tester", "Active Tester", "Experienced Tester", "Trusted Tester"];
  for (const [index, { score, html }] of reputation.entries()) {
    const trigger = helpTrigger(html);
    assert.equal(trigger.replace(/<[^>]+>/g, ""), `★${score}`);
    assert.ok(trigger.includes(`aria-label="About reputation ${score}, ${tiers[index]}"`));
    assert.match(trigger, /<span aria-hidden="true">★<\/span>/);
    assert.match(html, /participation score based on mods tested, readiness votes, and bug reports/);
    assert.match(html, /does not verify report quality or trustworthiness/);
    assert.doesNotMatch(html, /title=|—/);
  }
});

test("status badges can stay noninteractive and linked mod cards contain no help buttons", () => {
  assert.match(passiveBadge, /^<span class="inline-flex items-center gap-2 whitespace-nowrap/);
  assert.match(passiveBadge, /\bh-5 w-5 shrink-0\b/);
  assert.match(passiveBadge, /\btext-sm\b/);
  assert.equal(passiveBadge.replace(/<[^>]+>/g, ""), "beta");
  assert.match(passiveBadge, /lucide-test-tube-diagonal/);
  assert.doesNotMatch(passiveBadge, /<(?:button|a)\b|tabindex=|popover|aria-describedby=/);
  assert.match(modCard, /^<a\b/);
  assert.match(modCard, /href="\/mods\/example-mod"/);
  assert.match(modCard, /lucide-test-tube-diagonal/);
  assert.doesNotMatch(modCard, /<button\b|popover|aria-describedby=/);
});

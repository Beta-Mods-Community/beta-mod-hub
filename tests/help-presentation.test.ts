import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { helpFaqs, helpGuides, releaseChecklist } from "../lib/help-content";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rendered: { home: string; guides: string[]; missing: string } = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require('react');
  const { renderToStaticMarkup: render } = require('react-dom/server');
  const Home = require('./src/app/help/page').default;
  const Guide = require('./src/app/help/[guide]/page').default;
  (async () => {
    const guides = await Promise.all(['testing', 'authors', 'releasing'].map(async guide => render(await Guide({params: Promise.resolve({guide})}))));
    let missing = '';
    try { await Guide({params: Promise.resolve({guide: 'unknown'})}); } catch (error) { missing = error.message; }
    process.stdout.write(JSON.stringify({home: render(React.createElement(Home)), guides, missing}));
  })().catch(error => { console.error(error); process.exitCode = 1; });
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

test("Help provides real guide links and keyboard-native FAQ disclosures", () => {
  for (const guide of helpGuides) assert.ok(rendered.home.includes(`href="/help/${guide.slug}"`));
  assert.equal((rendered.home.match(/<details\b/g) ?? []).length, helpFaqs.length);
  assert.equal((rendered.home.match(/<summary\b/g) ?? []).length, helpFaqs.length);
  assert.match(rendered.home, /href="\/contact"/);
  assert.doesNotMatch(rendered.home, /<details[^>]*\bopen(?:=|>| )/);
});

test("each guide has one heading, one current route and working section anchors", () => {
  for (const [index, html] of rendered.guides.entries()) {
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    for (const section of helpGuides[index].sections) {
      assert.ok(html.includes(`href="#${section.id}"`));
      assert.ok(html.includes(`id="${section.id}"`));
      assert.ok(html.includes(`aria-labelledby="${section.id}-heading"`));
    }
    assert.doesNotMatch(html, /\u2014/);
  }
  assert.match(rendered.missing, /404/);
});

test("author templates expose selectable text and named copy buttons", () => {
  const html = rendered.guides[1];
  assert.equal((html.match(/<textarea\b[^>]*readOnly/g) ?? []).length, 2);
  assert.match(html, /aria-label="Copy testing brief"/);
  assert.match(html, /aria-label="Copy known issues"/);
  assert.equal((html.match(/role="status"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<form\b/);
  const source = read("src/components/help-template.tsx");
  assert.match(source, /catch\s*\{[\s\S]*field\.current\?\.select\(\)/);
  assert.doesNotMatch(source, /execCommand|localStorage|fetch\(/);
});

test("release checklist starts clear and never claims to publish or save progress", () => {
  const html = rendered.guides[2];
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, releaseChecklist.length);
  assert.doesNotMatch(html, /<input[^>]*\bchecked|<form\b/);
  assert.match(html, /For this page visit only/);
  assert.match(html, /does not approve a release, publish your mod, or change its status/);
  assert.match(html, /0 of 6 checked/);
  assert.doesNotMatch(read("src/components/release-checklist.tsx"), /fetch\(|localStorage|sessionStorage|useEffect|action=/);
});

test("help is discoverable without replacing existing workflows", () => {
  for (const path of ["src/components/header-nav.tsx", "src/components/footer.tsx", "src/app/contact/page.tsx"]) {
    assert.match(read(path), /["']\/help["']/);
  }
  assert.match(read("src/components/beta-mod-form.tsx"), /href="\/help\/authors#templates" target="_blank" rel="noopener"/);
  assert.match(read("src/components/testing-checklist.tsx"), /href="\/help\/testing"/);
  assert.match(read("src/app/mods/[id]/page.tsx"), /href="\/help\/releasing"/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { helpFaqs, helpGuides, releaseChecklist } from "../lib/help-content";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rendered: { home: string; guides: string[]; missing: string; checklist: string; readiness: string } = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require('react');
  const { renderToStaticMarkup: render } = require('react-dom/server');
  const Home = require('./src/app/help/page').default;
  const Guide = require('./src/app/help/[guide]/page').default;
  const Checklist = require('./src/components/release-checklist').default;
  const Readiness = require('./src/components/release-readiness-checklist').default;
  (async () => {
    const guides = await Promise.all(['testing', 'authors', 'releasing'].map(async guide => render(await Guide({params: Promise.resolve({guide})}))));
    let missing = '';
    try { await Guide({params: Promise.resolve({guide: 'unknown'})}); } catch (error) { missing = error.message; }
    process.stdout.write(JSON.stringify({home: render(React.createElement(Home)), guides, missing, checklist: render(React.createElement(Checklist)), readiness: render(React.createElement(Readiness))}));
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

test("Help release checklist is static guidance with decorative check emblems", () => {
  const html = rendered.checklist;
  assert.equal((html.match(/<li\b/g) ?? []).length, releaseChecklist.length);
  assert.equal((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length, releaseChecklist.length);
  assert.equal((html.match(/lucide-circle-check/g) ?? []).length, releaseChecklist.length);
  assert.doesNotMatch(html, /<input\b|<button\b|<form\b|role="status"|\d+ of \d+ checked/);
  assert.doesNotMatch(rendered.guides[2], /type="checkbox"|\d+ of \d+ checked/);
  assert.doesNotMatch(read("src/components/release-checklist.tsx"), /use client|useState|onChange|fetch\(|localStorage|sessionStorage|action=/);
});

test("author release checklist starts clear and describes its temporary manual role", () => {
  const html = rendered.readiness;
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, releaseChecklist.length);
  assert.doesNotMatch(html, /<input[^>]*\bchecked|<form\b/);
  assert.equal((html.match(/<label\b/g) ?? []).length, releaseChecklist.length);
  assert.equal((html.match(/aria-describedby="release-readiness-help"/g) ?? []).length, releaseChecklist.length);
  assert.match(html, /<legend[^>]*>Release checklist<\/legend>/);
  assert.match(html, /These checks are temporary and clear when you reload this page/);
  assert.match(html, /do not approve a release, publish your mod, or change its status/);
  assert.match(html, new RegExp(`0 of ${releaseChecklist.length} checked`));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(read("src/components/release-readiness-checklist.tsx"), /fetch\(|localStorage|sessionStorage|useEffect|action=|confirmPromotion/);
});

test("author release checklist stays within owner controls and resets per mod and build", () => {
  const source = read("src/app/mods/[id]/page.tsx");
  assert.match(source, /isOwner && !readOnly && \([\s\S]*?title="Publish on Nexus Mods"[\s\S]*?<ReleaseReadinessChecklist[^\n]*\/>[\s\S]*?promotion\/download[\s\S]*?<form action=\{confirmPromotion\}/);
  assert.ok(source.includes('key={`${mod.id}:${latestBuild?.id ?? "no-build"}`}'));
  assert.equal((source.match(/<ReleaseReadinessChecklist\b/g) ?? []).length, 1);
  assert.doesNotMatch(read("src/app/help/[guide]/page.tsx"), /ReleaseReadinessChecklist/);
  for (const component of ["release-checklist", "release-readiness-checklist"]) {
    assert.match(read(`src/components/${component}.tsx`), /import \{ releaseChecklist \} from "@lib\/help-content"/);
  }
});

test("help is discoverable without replacing existing workflows", () => {
  for (const path of ["src/components/header-nav.tsx", "src/components/footer.tsx", "src/app/contact/page.tsx"]) {
    assert.match(read(path), /["']\/help["']/);
  }
  assert.match(read("src/components/beta-mod-form.tsx"), /href="\/help\/authors#templates" target="_blank" rel="noopener"/);
  assert.match(read("src/components/testing-checklist.tsx"), /href="\/help\/testing"/);
  assert.match(read("src/app/mods/[id]/page.tsx"), /href="\/help\/releasing"/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const component = (name: string) => readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8");

// Structural guards complement the desktop/mobile interaction checks. They do
// not claim screen-reader or browser event coverage.
test("testing notes stay optional, local and separate from submitted feedback", () => {
  const source = component("testing-checklist");
  assert.match(source, /<details\s+className=/);
  assert.doesNotMatch(source, /<details[^>]*\bopen[=\s>]/);
  assert.match(source, /<fieldset/);
  assert.match(source, /<legend[^>]*>Personal testing checklist/);
  assert.match(source, /type="checkbox" checked=\{checked\[index\]\}/);
  assert.match(source, /For this page visit only/);
  assert.match(source, /do not submit a vote or report/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|<form|action=|@lib\//);
});

test("the checklist is scoped to the latest active build", () => {
  const page = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /latestBuild && !readOnly && <TestingChecklist key=\{latestBuild\.id\} versionLabel=\{latestBuild\.versionLabel\}/);
});

test("section icons are decorative and do not replace heading text", () => {
  const source = component("section-heading");
  assert.match(source, /<h2/);
  assert.match(source, /icon: LucideIcon/);
  assert.match(source, /<Icon aria-hidden="true" focusable="false"/);
  assert.match(source, /<span>\{title\}<\/span>/);
});

test("gallery focus is inset inside the clipped image wrapper", () => {
  assert.match(component("mod-gallery"), /className="focus-inset group/);
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.focus-inset:focus-visible\s*\{\s*outline-offset:\s*-4px !important;/);
  assert.match(css, /outline:\s*2px solid var\(--accent\) !important;/);
});

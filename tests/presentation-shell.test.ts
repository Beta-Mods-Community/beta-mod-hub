import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rendered: { skeletons: string[]; art: string[]; mark: string } = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup: render } = require("react-dom/server");
  const Skeleton = require("./src/components/page-skeleton").default;
  const Art = require("./src/components/empty-state-art").default;
  const Mark = require("./src/components/brand-mark").default;
  process.stdout.write(JSON.stringify({
    skeletons: ["page", "catalog", "mod"].map(layout => render(React.createElement(Skeleton, { layout }))),
    art: ["notifications", "following", "missing", "error"].map(kind => render(React.createElement(Art, { kind }))),
    mark: render(React.createElement(Mark)),
  }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

test("loading layouts announce one status and hide decorative shapes", () => {
  for (const html of rendered.skeletons) {
    assert.match(html, /role="status" aria-busy="true"/);
    assert.match(html, /class="sr-only">Loading page/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /motion-safe:animate-pulse/);
    assert.doesNotMatch(html, /<(?:a|button|input)\b/);
  }
});

test("empty-state artwork is decorative and introduces no remote assets or controls", () => {
  for (const html of rendered.art) {
    assert.match(html, /^<div aria-hidden="true"/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<(?:a|button|img|input)\b|(?:src|href)="https?:/);
  }
});

test("navigation and footer share the existing vector brand master", () => {
  assert.match(rendered.mark, /src="\/images\/beta-mods-mark\.svg"/);
  assert.match(rendered.mark, /alt=""/);
  for (const path of ["src/components/header.tsx", "src/components/footer.tsx"]) {
    assert.match(read(path), /<BrandMark\b/);
  }
});

test("shared forms retain invalid-field, file-picker, and reduced-motion styling", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.field\[aria-invalid="true"\]/);
  assert.match(css, /\.field\[type="file"\]::file-selector-button/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.form-actions\s*\{[^}]*flex-wrap: wrap/);
});

test("the dragon hero retains decorative diagonal panes without blocking controls", () => {
  const page = read("src/app/page.tsx");
  const css = read("src/app/home-hero.module.css");
  assert.match(page, /className=\{styles\.panels\} aria-hidden="true"/);
  assert.match(css, /\.panels\s*\{[^}]*pointer-events: none/);
  assert.match(css, /transform: skewX\(-22deg\)/);
  assert.match(css, /var\(--accent\)/);
});

test("the reading canvas fades into the outer background without blocking controls", () => {
  const canvas = read("src/app/globals.css").match(/#main-content::before\s*\{([^}]+)\}/)?.[1];
  assert.ok(canvas);
  assert.match(canvas, /mask-image: linear-gradient\(to right, transparent,/);
  assert.match(canvas, /pointer-events: none/);
  assert.doesNotMatch(canvas, /border(?:-inline)?:/);
});

test("shell and hero dividers stay inset with decorative fading ends", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.section-divider\s*\{[^}]*linear-gradient\(to right, transparent,[^}]*transparent\)/);
  for (const path of ["src/app/page.tsx", "src/components/header.tsx", "src/components/footer.tsx"]) {
    assert.match(read(path), /className="site-container section-divider[^\"]*" aria-hidden="true"/);
  }
  assert.doesNotMatch(read("src/app/home-hero.module.css"), /border-bottom:/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Render presentation components with normal React. No catalog query or service
// module is imported, and all listings below exist only in this process.
const rendered: Record<string, string> = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Filters = require("./src/components/catalog-filters").default;
  const Card = require("./src/components/mod-card").default;
  const Artwork = require("./src/components/mod-artwork").default;
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
  const mod = {
    id: "sample-mod", title: "Frost & Fire", description: "A **small** testing project.",
    game: "Skyrim Special Edition", tags: ["Gameplay", "UI", "Testing", "Experimental"],
    status: "beta", ownerName: "Example author", createdAt: "2026-09-30",
    updatedAt: "2026-10-01", testerCount: 3, openBugs: 2, ready: 1, total: 3,
    buildCount: 2, lastBuildAt: "2026-10-01", heroMediaId: "sample-image",
  };
  process.stdout.write(JSON.stringify({
    filters: render(Filters, { q: "", sort: "newest", games: ["Skyrim", "Fallout 4"] }),
    applied: render(Filters, { q: "frost & fire", game: "An unavailable game", sort: "needs-testers", games: ["Skyrim"] }),
    card: render(Card, { mod, featured: true, headingLevel: 3 }),
    noVotes: render(Card, { mod: { ...mod, testerCount: 0, total: 0, ready: 0, openBugs: 0 } }),
    noBuild: render(Card, { mod: { ...mod, testerCount: 0, total: 0, ready: 0, openBugs: 0, buildCount: 0, lastBuildAt: null, heroMediaId: null } }),
    artwork: render(Artwork, { title: "Frost & Fire", game: "Skyrim" }),
  }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

test("catalog search keeps one native GET control set and a keyboard-accessible filter disclosure", () => {
  const html = rendered.filters;
  const form = html.match(/<form\b[^>]*>/)?.[0] ?? "";
  assert.match(form, /action="\/browse"/);
  assert.match(form, /method="get"/);
  assert.match(form, /role="search"/);
  for (const name of ["q", "game", "sort"]) {
    assert.equal((html.match(new RegExp(`name="${name}"`, "g")) ?? []).length, 1);
  }
  const disclosure = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
  assert.ok(disclosure);
  assert.match(disclosure, /<summary\b/);
  assert.doesNotMatch(disclosure, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.match(disclosure, /<select[^>]*name="game"/);
  assert.match(disclosure, /<select[^>]*name="sort"/);
  assert.doesNotMatch(disclosure, /name="q"|type="submit"/);
  const search = html.match(/<input\b[^>]*>/)?.[0] ?? "";
  assert.match(search, /name="q"/);
  assert.match(search, /maxLength="100"/i);
  assert.match(html, /<button[^>]*type="submit"/);
  // Desktop only hides the summary once its controls are actually open.
  assert.match(disclosure, /lg:group-open:hidden/);
});

test("catalog controls retain the same visual and keyboard order at each viewport", () => {
  const html = rendered.filters;
  const queryPosition = html.indexOf('name="q"');
  const disclosurePosition = html.indexOf("<details");
  const disclosureEnd = html.indexOf("</details>");
  const submitPosition = html.indexOf('type="submit"');
  assert.ok(queryPosition >= 0 && queryPosition < disclosurePosition);
  assert.ok(disclosureEnd > disclosurePosition && disclosureEnd < submitPosition);
  assert.doesNotMatch(html, /(?:^|[\s:])order-/);
  assert.match(html, /<button[^>]*class="[^"]*justify-self-end/);
});

test("catalog filters preserve applied search, unavailable games and the supported sort values", () => {
  assert.match(rendered.applied, /value="frost &amp; fire"/);
  assert.match(rendered.applied, /<option value="An unavailable game" selected="">An unavailable game<\/option>/);
  assert.match(rendered.applied, /<option value="needs-testers" selected="">Needs testers<\/option>/);
  assert.match(rendered.filters, /<option value="newest" selected="">Newest<\/option>/);
  assert.match(rendered.applied, /\(2 applied\)/);
  const source = readFileSync(new URL("../src/components/catalog-filters.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /preventDefault|requestSubmit|fetch\(|router\./);
});

test("mod cards keep real counts and their heading level without controls nested inside the link", () => {
  const html = rendered.card;
  assert.match(html, /^<a\b/);
  assert.equal((html.match(/<a\b/g) ?? []).length, 1);
  assert.match(html, /href="\/mods\/sample-mod"/);
  assert.match(html, /<h3[^>]*>Frost &amp; Fire<\/h3>/);
  assert.match(html, /1\/3 ready votes/);
  assert.match(html, /2 open bugs/);
  assert.match(html, /2 builds · latest /);
  assert.match(html, />\+1<\/span>/);
  assert.doesNotMatch(html, /<button\b|popover|aria-describedby=|text-\[(?:10|11)px\]/);
  assert.match(html, /<img[^>]*src="\/media\/sample-image"[^>]*class="[^"]*object-cover/);
  assert.doesNotMatch(html, /object-contain/);
});

test("empty card states do not imply a build or testing activity exists", () => {
  assert.match(rendered.noVotes, /No readiness votes yet/);
  assert.match(rendered.noVotes, /2 builds · latest /);
  assert.doesNotMatch(rendered.noVotes, /0\/0 ready|0 open bugs/);
  assert.match(rendered.noBuild, /No build posted/);
  assert.match(rendered.noBuild, /No screenshot yet/);
  assert.doesNotMatch(rendered.noBuild, /<img\b|ready votes|No readiness votes yet|latest /);
});

test("fallback artwork is decorative original geometry and labels its missing screenshot", () => {
  assert.match(rendered.artwork, /^<div aria-hidden="true"/);
  assert.match(rendered.artwork, /<svg[^>]*viewBox="0 0 560 350"/);
  assert.match(rendered.artwork, /focusable="false"/);
  assert.match(rendered.artwork, /No screenshot yet/);
  assert.doesNotMatch(rendered.artwork, /<img\b|<image\b|href=|src=|<button\b/);
});

test("browse keeps active filters and reset outside the collapsed controls", () => {
  const source = readFileSync(new URL("../src/app/browse/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<CatalogFilters[\s\S]*?\/>[\s\S]*?<ul aria-label="Applied filters"/);
  assert.match(source, /Search: “\{q\}”/);
  assert.match(source, /Game: \{game\}/);
  assert.match(source, /Sort: Needs testers/);
  assert.match(source, /href="\/browse"[^>]*>\s*Reset filters/);
  assert.match(source, /browseUrl\(\{ q, game, sort: sortKey, page: page - 1 \}\)/);
  assert.match(source, /browseUrl\(\{ q, game, sort: sortKey, page: page \+ 1 \}\)/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

type Rendered = {
  empty: string;
  single: string;
  multiple: string;
  badges: string[];
};

// Static rendering protects captions and controls; browser layout, dialog
// interaction, focus restoration, and touch behavior still need browser checks.
const rendered: Rendered = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const Gallery = require("./src/components/mod-gallery").default;
  const Severity = require("./src/components/severity-badge").default;
  const ReportStatus = require("./src/components/report-status-badge").default;
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
  const ordinary = { id: "ordinary-shot", width: 1280, height: 720, caption: null, isHero: false, position: 0 };
  const hero = { id: "hero-shot", width: 720, height: 1280, caption: "A narrow passage <test> & light", isHero: true, position: 1 };
  process.stdout.write(JSON.stringify({
    empty: render(Gallery, { title: "Example mod", media: [] }),
    single: render(Gallery, { title: "Example mod", media: [ordinary] }),
    multiple: render(Gallery, { title: "Example mod", media: [ordinary, hero] }),
    badges: [
      ...["minor", "major", "blocking", "unknown"].map(severity => render(Severity, { severity })),
      ...["open", "acknowledged", "fixed", "unknown"].map(status => render(ReportStatus, { status })),
    ],
  }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

test("gallery pairs the selected full image with a wrapping semantic caption", () => {
  assert.equal(rendered.empty, "");
  assert.match(rendered.single, /<figure\b/);
  assert.match(rendered.single, /<figcaption\b[\s\S]*?Screenshot 1[\s\S]*?<\/figcaption>/);
  const firstImage = rendered.multiple.match(/<img\b[^>]*>/)?.[0] ?? "";
  assert.match(firstImage, /src="\/media\/hero-shot"/);
  assert.match(firstImage, /width="720" height="1280"/);
  assert.match(firstImage, /object-contain/);
  assert.match(rendered.multiple, /<figcaption\b[\s\S]*?class="[^"]*break-words[^"]*"[\s\S]*?A narrow passage &lt;test&gt; &amp; light[\s\S]*?<\/figcaption>/);
  assert.doesNotMatch(rendered.multiple, /<test>/);
});

test("gallery controls retain explicit names and never become form submissions", () => {
  for (const html of [rendered.single, rendered.multiple]) {
    for (const button of html.match(/<button\b[\s\S]*?<\/button>/g) ?? []) {
      assert.match(button, /^<button[^>]*type="button"/);
      assert.match(button, /^<button[^>]*aria-label="[^"]+"/);
      assert.doesNotMatch(button.slice(button.indexOf(">") + 1), /<(?:button|a)\b/);
    }
    assert.match(html, /<dialog[^>]*aria-label="Example mod screenshots"/);
    assert.doesNotMatch(html, /<dialog[^>]*\bopen(?:="[^"]*")?[\s>]/);
    assert.match(html, /aria-label="Close gallery"/);
  }
  assert.doesNotMatch(rendered.single, /aria-label="(?:Choose|Previous|Next) screenshot/);
  assert.match(rendered.multiple, /role="group" aria-label="Choose screenshot"/);
  assert.equal((rendered.multiple.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(rendered.multiple, /aria-label="Previous screenshot"/);
  assert.match(rendered.multiple, /aria-label="Next screenshot"/);
});

test("report metadata badges keep readable text and accessible contextual help", () => {
  for (const html of rendered.badges) {
    const button = html.match(/<button\b[^>]*>/)?.[0] ?? "";
    assert.match(button, /\btext-xs\b/);
    assert.doesNotMatch(button, /text-\[(?:10|11)px\]/);
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="About [^"]+"/);
    assert.match(button, /aria-describedby="[^"]+"/);
    assert.match(html, /role="tooltip"/);
  }
});

test("mod section links have an accessible name without a redundant visible label", () => {
  const page = readFileSync(new URL("../src/app/mods/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="Mod page sections"/);
  assert.match(page, /SECTION_LINKS\.map/);
  assert.doesNotMatch(page, />On this page</);
});

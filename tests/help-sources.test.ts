import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { helpFaqs, helpGuides, helpReview } from "../lib/help-content";

test("Help renders references beside the relevant guidance and dates the review", () => {
  const rendered: { home: string; guides: string[]; empty: string } = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const React = require('react');
    const {renderToStaticMarkup: render} = require('react-dom/server');
    const Home = require('./src/app/help/page').default;
    const Guide = require('./src/app/help/[guide]/page').default;
    const Sources = require('./src/components/help-sources').default;
    (async () => {
      const guides = await Promise.all(['testing','authors','releasing'].map(async guide => render(await Guide({params:Promise.resolve({guide})}))));
      process.stdout.write(JSON.stringify({home:render(React.createElement(Home)), guides, empty:render(React.createElement(Sources))}));
    })().catch(error => {console.error(error);process.exitCode=1;});
  `], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));
  assert.equal(rendered.empty, "");
  for (const faq of helpFaqs) {
    const start = rendered.home.indexOf(`id="${faq.id}"`);
    const section = rendered.home.slice(start, rendered.home.indexOf("</details>", start));
    for (const source of faq.sources ?? []) assert.ok(section.includes(`href="${source.url}"`));
  }
  for (const [index, guide] of helpGuides.entries()) {
    const html = rendered.guides[index];
    assert.ok(html.includes(`dateTime="${helpReview.date}"`));
    for (const section of guide.sections) {
      const start = html.indexOf(`id="${section.id}"`);
      const renderedSection = html.slice(start, html.indexOf("</section>", start));
      for (const source of section.sources ?? []) assert.ok(renderedSection.includes(`href="${source.url}"`));
    }
  }
});

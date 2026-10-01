import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { helpPosition } from "../lib/help-position";

test("help fits beside its trigger and flips above near the bottom", () => {
  const panel = { width: 336, height: 190 };
  const viewport = { width: 1200, height: 800 };
  assert.deepEqual(helpPosition({ left: 300, right: 330, top: 100, bottom: 130 }, panel, viewport), { left: 300, top: 138 });
  assert.deepEqual(helpPosition({ left: 300, right: 330, top: 740, bottom: 770 }, panel, viewport), { left: 300, top: 542 });
});

test("help stays within phone and desktop edges", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    for (const left of [-8, 0, viewport.width - 30]) {
      for (const top of [0, 300, viewport.height - 30]) {
        const panel = { width: 336, height: 190 };
        const position = helpPosition({ left, right: left + 30, top, bottom: top + 30 }, panel, viewport);
        assert.ok(position.left >= 12);
        assert.ok(position.left + panel.width <= viewport.width - 12);
        assert.ok(position.top >= 12);
        assert.ok(position.top + panel.height <= viewport.height - 12);
      }
    }
  }
});

test("help uses the available height for short viewports", () => {
  assert.deepEqual(helpPosition({ left: 10, right: 34, top: 60, bottom: 84 }, { width: 296, height: 156 }, { width: 320, height: 180 }), { left: 12, top: 12 });
});

test("help renders a named non-submit button tied to a hidden native tooltip", () => {
  const html = execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const Help = require("./src/components/context-help").default;
    process.stdout.write(renderToStaticMarkup(React.createElement(Help, {
      title: "Private attachment", description: "Only reporter & author. <script>not markup</script>",
      label: "About private attachments", children: "Lock",
    })));
  `], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 });
  const id = html.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(id);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-label="About private attachments"/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(html.match(/popovertarget="([^"]+)"/i)?.[1], id);
  assert.ok(html.includes(`id="${id}" popover="auto" role="tooltip"`));
  assert.match(html, /Only reporter &amp; author\. &lt;script&gt;not markup&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b|<a\b|tabindex=|autofocus=/);
});

test("help supports hover, focus and tap without submitting an action", () => {
  // Structural guards complement browser interaction checks, not simulate them.
  const source = readFileSync(new URL("../src/components/context-help.tsx", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("context-help.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map<string, string>();
  const bindings = new Map<string, ts.Expression>();
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) functions.set(node.name.text, node.body.getText(parsed));
    if (ts.isJsxOpeningElement(node)) {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
          bindings.set(`${node.tagName.getText(parsed)}:${attribute.name.getText(parsed)}`, attribute.initializer.expression);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  function handler(tag: string, event: string) {
    const expression = bindings.get(`${tag}:${event}`);
    assert.ok(expression, `Missing ${tag} ${event} handler`);
    const body = ts.isIdentifier(expression) ? functions.get(expression.text) : expression.getText(parsed);
    assert.ok(body, `Missing body for ${tag} ${event}`);
    return body.replace(/\s+/g, " ");
  }
  assert.match(handler("button", "onPointerEnter"), /if \(event\.pointerType !== "touch"\) show\(\)/);
  assert.match(handler("button", "onFocus"), /if \(event\.currentTarget\.matches\(":focus-visible"\)\) show\(\)/);
  assert.match(handler("button", "onClick"), /event\.preventDefault\(\)/);
  assert.match(handler("button", "onClick"), /pinned\.current = true; show\(\)/);
  assert.match(handler("span", "onPointerEnter"), /overPanel\.current = true; cancelClose\(\)/);
  assert.match(handler("button", "onBlur"), /if \(!overPanel\.current\) hide\(\)/);
  assert.match(handler("button", "onKeyDown"), /event\.key === "Tab"\) hide\(\)/);
  assert.match(source, /document\.addEventListener\("keydown", dismissOnTab\)/);
  assert.match(source, /document\.removeEventListener\("keydown", dismissOnTab\)/);
  assert.match(source, /popover="auto"/);
  assert.doesNotMatch(source, /fetch\(|requestSubmit\(|\.submit\(|dangerouslySetInnerHTML/);
});

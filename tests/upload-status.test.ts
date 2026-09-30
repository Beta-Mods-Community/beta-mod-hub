import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { formatUploadElapsed, LONG_UPLOAD_WAIT_MS, uploadLongWaitMessage, uploadPendingMessage } from "../src/lib/upload-status";

test("elapsed time is elapsed minutes/seconds, never percent or an estimated finish time", () => {
  for (const [milliseconds, expected] of [[0, "0:00"], [999, "0:00"], [1000, "0:01"], [59_999, "0:59"], [60_000, "1:00"], [125_432, "2:05"], [3_600_000, "60:00"]] as const) {
    assert.equal(formatUploadElapsed(milliseconds), expected);
  }
  for (const invalid of [-10, NaN, Infinity, -Infinity]) assert.equal(formatUploadElapsed(invalid), "0:00");
});

test("only file submissions mention uploading/checking and the possible wait", () => {
  assert.match(uploadPendingMessage(true), /can take 1–2 minutes, sometimes longer/);
  assert.match(uploadPendingMessage(true), /checking your file/);
  assert.doesNotMatch(uploadPendingMessage(false), /file|scan|upload|1–2/);
  for (const hasFile of [false, true]) {
    assert.match(uploadPendingMessage(hasFile), /Keep this page open and do not submit again while it is pending/);
  }
});

test("long wait guidance changes once at two minutes without claiming failure or safety to retry", () => {
  assert.equal(LONG_UPLOAD_WAIT_MS, 120_000);
  for (const elapsed of [0, 119_999, -1, NaN, Infinity]) assert.equal(uploadLongWaitMessage(elapsed), "");
  const warning = uploadLongWaitMessage(120_000);
  assert.match(warning, /without confirmation/);
  assert.match(warning, /do not resubmit while it is pending/);
  assert.equal(uploadLongWaitMessage(240_000), warning);
  assert.doesNotMatch(warning, /failed|complete|retry now|scan is/);
});

function source(file: string) {
  return readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");
}

// Structural guards supplement the pure tests; not a screen-reader/browser test.
test("spinner respects reduced motion and ticking clock sits outside polite live regions", () => {
  const text = source("upload-status.tsx");
  const tree = ts.createSourceFile("status.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let timers = 0;
  let liveRegions = 0;
  function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
    return node.attributes.properties.filter(ts.isJsxAttribute).find(item => item.name.getText(tree) === name)?.initializer?.getText(tree);
  }
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (attribute(node, "role") === '"timer"') {
        timers++;
        assert.equal(attribute(node, "aria-live"), '"off"');
        let ancestor = node.parent;
        while (ancestor) {
          if (ts.isJsxElement(ancestor)) {
            assert.notEqual(attribute(ancestor.openingElement, "role"), '"status"');
            assert.notEqual(attribute(ancestor.openingElement, "aria-live"), '"polite"');
          }
          ancestor = ancestor.parent;
        }
      }
      if (attribute(node, "role") === '"status"') {
        liveRegions++;
        assert.equal(attribute(node, "aria-live"), '"polite"');
        assert.equal(attribute(node, "aria-atomic"), '"true"');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(timers, 1);
  assert.equal(liveRegions, 2);
  assert.match(text, /motion-reduce:animate-none/);
  assert.match(text, /performance\.now\(\) - startedAt/);
  assert.match(text, /return \(\) => window\.clearInterval\(timer\)/);
  assert.match(text, /pending && <PendingClock\s*\/>/);
  assert.doesNotMatch(text, /role="progressbar"|aria-valuenow/);
});

test("all upload forms use the shared pending state without muting its live announcements", () => {
  for (const file of ["build-upload-form.tsx", "bug-report-form.tsx", "mod-media-manager.tsx"]) {
    const text = source(file);
    assert.match(text, /<UploadStatus pending=\{pending\}/, file);
    assert.match(text, /disabled=\{pending(?:\s*\|\|[^}]+)?\}/, file);
    assert.doesNotMatch(text, /aria-busy=\{pending\}/, file);
  }
  const report = source("bug-report-form.tsx");
  assert.match(report, /attachment instanceof File && attachment\.size > 0/);
  assert.match(report, /hasFile=\{submittedWithAttachment\}/);
  assert.doesNotMatch(report, /Submitting and scanning attachment/);
});

test("upload text stays controlled and uncertain recovery never appends a blanket retry instruction", () => {
  for (const [file, fields] of [
    ["build-upload-form.tsx", ["versionLabel", "changelog"]],
    ["bug-report-form.tsx", ["description", "reproSteps", "buildId", "severity"]],
    ["mod-media-manager.tsx", ["caption"]],
  ] as const) {
    const text = source(file);
    for (const field of fields) assert.ok(text.includes(`value={${field}}`), `${file}: ${field} remains controlled`);
    assert.doesNotMatch(text, /\{state\.message\}[^<]*retry/, file);
  }
  assert.match(source("build-upload-form.tsx"), /recoverUploadAction\(uploadBuild, previous, data, unstable_rethrow/);
  assert.match(source("bug-report-form.tsx"), /recoverUploadAction\(submitBugReport, previous, data, unstable_rethrow/);
});

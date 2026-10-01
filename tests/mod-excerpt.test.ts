import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { modExcerpt } from "../lib/mod-excerpt";

test("excerpt preserves substantive plain text and normalizes whitespace", () => {
  assert.equal(modExcerpt("A lightweight Skyrim mod.\n\n  Test a new start with your existing load order."), "A lightweight Skyrim mod. Test a new start with your existing load order.");
  assert.equal(modExcerpt("Use start_ng and other_mod; keep [optional] files; 2 * 3 = 6."), "Use start_ng and other_mod; keep [optional] files; 2 * 3 = 6.");
});

test("excerpt prefers prose over Markdown headings and decorative images", () => {
  assert.equal(modExcerpt("# Start NG\n\n![Build status](https://example.com/badge.svg)\n\n## Overview\nA **new start** with _faster setup_ and ~~old~~ updated choices."), "A new start with faster setup and old updated choices.");
  assert.equal(modExcerpt("Start NG\n========\n\nA different opening.\n\nFeatures\n--------\n- Choose your start\n- [x] Skip the cart ride"), "A different opening. Choose your start Skip the cart ride");
  assert.equal(modExcerpt("# A playable alternate start"), "A playable alternate start");
  assert.equal(modExcerpt("A **new _alternate_ start**."), "A new alternate start.");
});

test("excerpt keeps link labels and removes destinations and reference definitions", () => {
  assert.equal(modExcerpt('Requires [SKSE](https://example.com/releases_(stable) "Download") and [Address Library][library].\n\n[library]: https://example.com/library\nUse [guide] for setup.\n[guide]: https://example.com/guide'), "Requires SKSE and Address Library. Use guide for setup.");
  assert.equal(modExcerpt("Visit <https://example.com> or contact <author@example.com>."), "Visit https://example.com or contact author@example.com.");
});

test("excerpt keeps inline code literal and skips fenced examples when prose exists", () => {
  assert.equal(modExcerpt("Use `start_ng` with ``file_*_name``.\n\n```ini\n[settings]\nstart=true\n```\n\nYour opening stays configurable."), "Use start_ng with file_*_name. Your opening stays configurable.");
  assert.equal(modExcerpt("~~~sh\nstart --safe\n~~~"), "start --safe");
  assert.equal(modExcerpt("This is the summary.\n```txt\nunclosed example"), "This is the summary.");
  assert.equal(modExcerpt("Run `a | b` or `x < y` when testing."), "Run a | b or x < y when testing.");
});

test("excerpt handles quotes, tables, escaped punctuation and HTML as text", () => {
  assert.equal(modExcerpt("> Try a fresh save.\n\n| Mode | Result |\n| :--- | ---: |\n| Safe | Quick |\n\nUse \\*literal\\* labels &amp; keep &#35;1."), "Try a fresh save. Mode Result Safe Quick Use *literal* labels & keep #1.");
  assert.equal(modExcerpt('<script>alert("bad")</script><!-- hidden --><p>Test <strong>new</strong> starts.</p><img src=x onerror=alert(1)>'), "Test new starts.");
  assert.equal(modExcerpt("Plain 2 < 3 and 5 > 4."), "Plain 2 < 3 and 5 > 4.");
});

test("excerpt is empty for missing or formatting-only descriptions", () => {
  for (const value of [null, undefined, "", " \n\t ", "#\n\n## ", "---\n\n***", "![screenshot](https://example.com/a.png)", "<!-- private note -->"]) assert.equal(modExcerpt(value), "");
});

test("excerpt truncates at a word boundary within the requested length", () => {
  assert.equal(modExcerpt("A different opening with configurable choices.", 30), "A different opening with…");
  assert.equal(modExcerpt("exact", 5), "exact");
  assert.equal(modExcerpt("abcdef", 4), "abc…");
  assert.equal(modExcerpt("abcdef", 1), "…");
  assert.equal(modExcerpt("😀😀😀😀", 3), "😀😀…");
  assert.equal(modExcerpt("A😀B", 3), "A😀B");
  for (const length of [0, -1, NaN, Infinity]) assert.equal(modExcerpt("example", length), "");
});

test("excerpt bounds work for 10,000-character adversarial Markdown", { timeout: 15000 }, async () => {
  const worker = new Worker(`
    const { parentPort, workerData } = require("node:worker_threads");
    require("tsx/cjs");
    const { modExcerpt } = require(workerData);
    parentPort.postMessage("ready");
    parentPort.once("message", () => {
      for (const pattern of ["\u0060", "*a ", "_a ", "[", "[](", "<a ", "<x@", " ", "- ", "|:---"]) {
        parentPort.postMessage(pattern);
        const result = modExcerpt("x " + pattern.repeat(10000).slice(0, 9998));
        if (Array.from(result).length > 280) throw new Error("Excerpt exceeded its limit");
      }
      parentPort.postMessage("done");
    });
  `, { eval: true, execArgv: [], workerData: fileURLToPath(new URL("../lib/mod-excerpt.ts", import.meta.url)) });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Excerpt worker did not start")), 10000);
      worker.on("error", reject);
      worker.on("message", (message: string) => {
        clearTimeout(timer);
        if (message === "done") return resolve();
        timer = setTimeout(() => reject(new Error(`Excerpt exceeded 1 second for ${JSON.stringify(message)}`)), 1000);
        if (message === "ready") worker.postMessage("run");
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
});

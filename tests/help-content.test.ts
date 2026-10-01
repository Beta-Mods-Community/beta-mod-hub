import assert from "node:assert/strict";
import { test } from "node:test";

import { helpFaqs, helpGuides, helpTemplates, releaseChecklist } from "../lib/help-content";

const anchorPattern = /^[a-z]+(?:-[a-z]+)*$/;

test("help guides have the three stable routes and usable section anchors", () => {
  assert.deepEqual(helpGuides.map(guide => guide.slug), ["testing", "authors", "releasing"]);
  for (const guide of helpGuides) {
    assert.ok(guide.title.trim());
    assert.ok(guide.description.trim());
    assert.ok(guide.sections.length > 0);
    assert.equal(new Set(guide.sections.map(section => section.id)).size, guide.sections.length);
    for (const section of guide.sections) {
      assert.match(section.id, anchorPattern);
      assert.ok(section.title.trim());
      const content = [...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? [])];
      assert.ok(content.length > 0);
      for (const text of content) assert.ok(text.trim());
    }
  }
});

test("FAQs provide unique anchors and complete plain-text answers", () => {
  assert.equal(new Set(helpFaqs.map(faq => faq.id)).size, helpFaqs.length);
  for (const faq of helpFaqs) {
    assert.match(faq.id, anchorPattern);
    assert.ok(faq.question.endsWith("?"));
    assert.ok(faq.answer.trim());
    assert.doesNotMatch(faq.answer, /<\/?[a-z][^>]*>/i);
  }
});

test("copyable templates start with a short summary rather than a heading", () => {
  assert.deepEqual(helpTemplates.map(template => template.id), ["testing-brief", "known-issues"]);
  for (const template of helpTemplates) {
    assert.ok(template.title.trim());
    assert.ok(template.description.trim());
    const firstLine = template.markdown.split(/\r?\n/).find(line => line.trim());
    assert.ok(firstLine);
    assert.ok(firstLine.length <= 250);
    assert.doesNotMatch(firstLine, /^\s*#/);
    assert.match(template.markdown, /^## /m);
    assert.match(template.markdown, /\[[^\]]+\]/);
  }
});

test("guides preserve the important testing and manual-publication boundaries", () => {
  const content = JSON.stringify({ helpGuides, helpFaqs });
  assert.match(content, /Only the original reporter can record a retest/);
  assert.match(content, /Earlier votes stay in testing history but do not count toward a newer build/);
  assert.match(content, /no per-mod codes/);
  assert.match(content, /latest scanned build, not every earlier build/);
  assert.match(content, /Downloading the package does not change your listing's status/);
  assert.match(content, /Reports, private attachments, and votes are not included/);
  assert.match(content, /does not guarantee safety or compatibility/);
  for (const filename of ["description.bbcode.txt", "summary.txt", "readme.txt", "changelog.txt", "requirements.txt", "captions.txt"]) {
    assert.ok(content.includes(filename), `${filename} is explained`);
  }
});

test("help copy does not use em dashes", () => {
  assert.doesNotMatch(JSON.stringify({ helpGuides, helpFaqs, helpTemplates, releaseChecklist }), /\u2014/);
});

test("release checklist contains distinct reminders and FAQs defer to current form limits", () => {
  assert.equal(releaseChecklist.length, 6);
  assert.equal(new Set(releaseChecklist).size, releaseChecklist.length);
  for (const item of releaseChecklist) assert.ok(item.trim());
  const limits = helpFaqs.find(faq => faq.id === "upload-limits");
  assert.ok(limits);
  assert.match(limits.answer, /Each upload form shows its current file limits/);
  assert.doesNotMatch(limits.answer, /\d+\s*(?:MiB|GiB|entries)/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const attachmentId = "25aa3543-a688-430c-88bd-aab833b46a2f";
const filename = `crash <img src=x onerror="boom"> & 'quoted'.LoG`;
const buildVersion = `v1.2 <beta> & "test"`;
const notes = `first <script>alert("x")</script>\nsecond & 'note'`;
const extensions = ["txt", "log", "zip", "sav", "save", "fos", "json", "ini"];
const fileCases = [
  { filename, label: "LOG" },
  ...extensions.flatMap(extension => [extension, extension.toUpperCase()].map(value => ({
    filename: `sample.${value}`, label: extension.toUpperCase(),
  }))),
  ...["README", ".log", "sample.exe", "sample.log.exe", "sample.log.", "sample.constructor", ""].map(value => ({
    filename: value, label: "FILE",
  })),
];
const statuses = ["requested", "resolved", "still-present", "not-requested", "unknown", "constructor", "__proto__", "toString", ""];

type Rendered = {
  attachments: { filename: string; label: string; html: string }[];
  retests: { status: string; html: string }[];
  noDetails: string;
  emptyDetails: string;
  unavailableBuild: string;
};

// The suite uses react-server; Lucide renders under normal React in this child.
// Only pure presentation components are imported: no actions, environment files,
// route handlers, or database clients are loaded.
const rendered: Rendered = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", `
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const PrivateAttachmentLink = require("./src/components/private-attachment-link").default;
  const RetestNotice = require("./src/components/retest-notice").default;
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
  const attachments = ${JSON.stringify(fileCases)}.map(item => ({
    ...item, html: render(PrivateAttachmentLink, {
      attachmentId: ${JSON.stringify(attachmentId)}, filename: item.filename, sizeLabel: "14.2 KiB",
    }),
  }));
  const retests = ${JSON.stringify(statuses)}.map(status => ({
    status, html: render(RetestNotice, {
      status, buildVersion: ${JSON.stringify(buildVersion)}, notes: ${JSON.stringify(notes)},
    }),
  }));
  process.stdout.write(JSON.stringify({
    attachments, retests,
    noDetails: render(RetestNotice, { status: "requested", notes: null }),
    emptyDetails: render(RetestNotice, { status: "requested", buildVersion: "", notes: "" }),
    unavailableBuild: render(RetestNotice, { status: "requested", buildVersion: "unavailable" }),
  }));
`], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 30_000 }));

function escaped(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function decorativeIcons(html: string, count: number) {
  const icons = html.match(/<svg\b[^>]*>/g) ?? [];
  assert.equal(icons.length, count);
  for (const icon of icons) {
    assert.match(icon, /aria-hidden="true"/);
    assert.match(icon, /focusable="false"/);
    assert.doesNotMatch(icon, /aria-label=|tabindex=|role=/);
  }
}

test("private attachment links preserve the download route, escaped filename, and size", () => {
  const html = rendered.attachments[0].html;
  assert.equal((html.match(/<a\b/g) ?? []).length, 1);
  assert.ok(html.includes(`href="/attachments/${attachmentId}"`));
  assert.ok(html.includes(`Download ${escaped(filename)}`));
  assert.match(html, />14\.2 KiB<\/span>/);
  assert.doesNotMatch(html, /<img\b|<script\b|target=/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1, "Only the privacy hint is a help control");
  assert.doesNotMatch(html.match(/<a\b[\s\S]*?<\/a>/)?.[0] ?? "", /<button\b/);
});

test("filename labels recognize supported extensions regardless of case and fall back to FILE", () => {
  for (const { filename: value, label, html } of rendered.attachments) {
    assert.ok(html.includes(`>${label}</span>`), `Wrong extension label for ${JSON.stringify(value)}`);
  }
});

test("attachment paperclip and lock are decorative while the privacy restriction remains readable", () => {
  const html = rendered.attachments[0].html;
  decorativeIcons(html, 2);
  assert.match(html, /lucide-paperclip/);
  assert.match(html, /lucide-lock-keyhole/);
  assert.match(html, /<span>Reporter and mod author only<\/span>/);
  assert.doesNotMatch(html, /aria-label=|role="(?:button|img)"|tabindex=/);
});

test("retest states retain distinct icons, readable labels, escaped builds, and multiline notes", () => {
  const states = [
    ["requested", "Retest requested", "rotate-ccw"],
    ["resolved", "Reporter confirmed resolved", "circle-check"],
    ["still-present", "Reporter says the issue remains", "circle-alert"],
  ];
  for (const [status, label, icon] of states) {
    const row = rendered.retests.find(item => item.status === status);
    assert.ok(row);
    decorativeIcons(row.html, 1);
    assert.ok(row.html.includes(`lucide-${icon}`));
    assert.ok(row.html.includes(`>${label}</span>`));
    assert.ok(row.html.includes(`>Build ${escaped(buildVersion)}</p>`));
    assert.ok(row.html.includes(`>${escaped(notes)}</p>`));
    assert.match(row.html, /<p class="[^"]*whitespace-pre-wrap[^"]*">first/);
    assert.doesNotMatch(row.html, /<script\b|<beta\b|<a\b|tabindex=/);
    assert.match(row.html, /<button[^>]*type="button"/);
    assert.match(row.html, /role="tooltip"/);
  }
});

test("retest notices omit absent details and preserve the unavailable-build fallback", () => {
  for (const html of [rendered.noDetails, rendered.emptyDetails]) {
    assert.equal((html.match(/<p\b/g) ?? []).length, 0);
    assert.match(html, />Retest requested<\/span>/);
    assert.doesNotMatch(html, /Build |whitespace-pre-wrap/);
  }
  assert.match(rendered.unavailableBuild, />Build unavailable<\/p>/);
});

test("unrequested, unknown, and prototype-key retest statuses render no notice", () => {
  for (const row of rendered.retests.filter(item => !["requested", "resolved", "still-present"].includes(item.status))) {
    assert.equal(row.html, "", `Unexpected notice for ${JSON.stringify(row.status)}`);
  }
});

test("report source keeps attachment metadata and detail rendering inside existing authorization filters", () => {
  // Static regression guard only; this does not execute a query or establish
  // route authorization coverage.
  const file = readFileSync(new URL("../src/components/bug-reports.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("bug-reports.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.match(file, /reports\.filter\(row => canReadAttachment\(viewerId, row\.report\.reporterId, row\.ownerId\)\)\.map\(row => row\.report\.id\)/);
  assert.match(file, /privateReportIds\.length \? db\.select\([\s\S]*?inArray\(bugAttachments\.reportId, privateReportIds\), eq\(bugAttachments\.scanState, "clean"\)\)\) : \[\]/);
  assert.match(file, /const reportAttachments = attachments\.filter\(attachment => attachment\.reportId === report\.id\)/);

  const links: ts.JsxSelfClosingElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "PrivateAttachmentLink") links.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(links.length, 1);
  const link = links[0];
  assert.match(link.getText(), /attachmentId=\{attachment\.id\}/);
  assert.match(link.getText(), /filename=\{attachment\.filename\}/);
  assert.match(link.getText(), /sizeLabel=\{formatBytes\(attachment\.sizeBytes\)\}/);
  let ancestor: ts.Node | undefined = link.parent;
  while (ancestor && !(ts.isCallExpression(ancestor) && ancestor.expression.getText() === "reportAttachments.map")) ancestor = ancestor.parent;
  assert.ok(ancestor, "Private attachment details must remain in the authorized report attachment map");
});

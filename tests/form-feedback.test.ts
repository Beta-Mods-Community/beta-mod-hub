import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import FormErrorSummary from "../src/components/form-error-summary";
import * as archivePolicy from "../lib/build-upload-policy";
import * as attachmentPolicy from "../lib/feedback-policy";
import { formatBytes } from "../lib/pilot";

type Element = { type: string | ((props: Props) => unknown); props: Props };
type Props = Record<string, unknown>;
type FormState = { message?: string; errors?: Record<string, string[]> } | undefined;

// Execute the actual render and event-handler code with inert action imports
// and controlled hook snapshots. These are component tests, not DOM/reset or
// screen-reader tests; no database, provider or network is loaded.
function formHarness(file: string, props: Props) {
  const source = readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const values: unknown[] = [];
  let cursor = 0;
  let state: FormState;
  let pending = false;
  const unusedAction = () => assert.fail("Rendering must not call a server action");
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    react: {
      useId: () => "fixture",
      useActionState: () => [state, unusedAction, pending],
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (value: unknown) => { values[index] = value; }];
      },
    },
    "next/navigation": { unstable_rethrow: unusedAction },
    "@lib/feedback": { submitBugReport: unusedAction },
    "@lib/build-uploads": { uploadBuild: unusedAction },
    "@lib/build-upload-policy": archivePolicy,
    "@lib/feedback-policy": attachmentPolicy,
    "@lib/pilot": { formatBytes },
    "@/lib/upload-action-recovery": {},
    "@/components/form-error-summary": { default: FormErrorSummary },
    "@/components/upload-status": { default: () => null },
  };
  const exported: { default?: (props: Props) => Element } = {};
  runInNewContext(compiled, {
    exports: exported,
    File,
    // The fake currentTarget is already FormData; avoid introducing a DOM.
    FormData: class { constructor(data: FormData) { return data; } },
    require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected real dependency: ${name}`);
      return modules[name];
    },
  });
  return {
    render: () => { cursor = 0; return exported.default!(props); },
    result: (next: FormState, isPending = false) => { state = next; pending = isPending; },
  };
}

function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  if (typeof element.type === "function") return nodes(element.type(element.props));
  return [element, ...nodes(element.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const element = node as Element;
  return text(typeof element.type === "function" ? element.type(element.props) : element.props.children);
}

function control(tree: Element, name: string): Element {
  const found = nodes(tree).find(node => node.props.name === name);
  assert.ok(found, `Missing ${name} control`);
  return found;
}

function change(tree: Element, name: string, target: Props) {
  (control(tree, name).props.onChange as (event: { target: Props }) => void)({ target });
}

function submit(tree: Element, data: FormData) {
  (tree.props.onSubmit as (event: Props) => void)({ currentTarget: data, preventDefault: () => {} });
}

const reportProps = { betaModId: "mod", builds: [{ id: "build", versionLabel: "1.0" }] };

test("upload denial removes the attachment picker but leaves text-only reports usable", () => {
  const form = formHarness("bug-report-form.tsx", {
    ...reportProps,
    uploadPermission: { allowed: false, message: "Uploads are paused." },
  });
  const tree = form.render();
  assert.equal(nodes(tree).some(node => node.props.name === "attachment"), false);
  assert.equal(control(tree, "description").props.required, true);
  assert.equal(nodes(tree).find(node => node.type === "button")?.props.disabled, false);
  assert.match(text(tree), /Uploads are paused.*still submit a text-only report/);
  for (const uploadPermission of [undefined, { allowed: true }]) {
    assert.equal(control(formHarness("bug-report-form.tsx", { ...reportProps, uploadPermission }).render(), "attachment").props.type, "file");
  }
});

test("field-only action failures announce the actual errors and link to their controls", () => {
  for (const [file, props, field, message] of [
    ["bug-report-form.tsx", reportProps, "description", "Describe the bug in more detail."],
    ["build-upload-form.tsx", { betaModId: "mod", maxBytes: 100 }, "versionLabel", "Add a version label."],
  ] as const) {
    const form = formHarness(file, props);
    form.result({ errors: { [field]: [message] } });
    const tree = form.render();
    const alert = nodes(tree).find(node => node.props.role === "alert");
    assert.ok(alert);
    assert.ok(text(alert).includes(message));
    assert.ok(nodes(alert).some(node => node.type === "a" && node.props.href === `#${control(tree, field).props.id}`));
    form.result({ errors: { [field]: [message] } }, true);
    assert.equal(nodes(form.render()).some(node => node.props.role === "alert"), false);
  }
});

test("failed attachment submissions warn about reselection without losing report text or retaining a stale warning", () => {
  const form = formHarness("bug-report-form.tsx", reportProps);
  change(form.render(), "description", { value: "The spell unexpectedly disappears." });
  const payload = new FormData();
  payload.set("attachment", new File(["harmless fixture"], "sample.log"));
  submit(form.render(), payload);
  form.result(undefined, true);
  change(form.render(), "attachment", { files: [new File(["fixture"], "another.log")] });
  for (const result of [{ errors: { description: ["Add more detail."] } }, { message: "Could not confirm this report. Check reports before submitting again." }]) {
    form.result(result);
    const tree = form.render();
    assert.match(text(tree), /file selection has been cleared.*select your attachment again/);
    assert.equal(control(tree, "description").props.value, "The spell unexpectedly disappears.");
  }
  change(form.render(), "attachment", { files: [new File(["fixture"], "sample.log")] });
  assert.doesNotMatch(text(form.render()), /file selection has been cleared/);
  submit(form.render(), payload);
  form.result(undefined);
  assert.doesNotMatch(text(form.render()), /file selection has been cleared|report text is preserved/);
});

test("text-only failures never claim an attachment was cleared", () => {
  const form = formHarness("bug-report-form.tsx", reportProps);
  submit(form.render(), new FormData());
  form.result({ errors: { description: ["Add more detail."] } });
  assert.doesNotMatch(text(form.render()), /file selection has been cleared|attachment again/);
});

test("client build file errors set aria-invalid and describe both help and the current error", () => {
  const form = formHarness("build-upload-form.tsx", { betaModId: "mod", maxBytes: 100 });
  // scripts/e2e-upload.mjs identifies the native upload form by this stable ID.
  assert.equal(control(form.render(), "file").props.id, "build-file");
  assert.ok(nodes(form.render()).some(node => node.type === "label" && node.props.htmlFor === "build-file"));
  for (const invalid of [new File(["fixture"], "file.exe"), new File(["x".repeat(101)], "file.zip")]) {
    change(form.render(), "file", { files: [invalid] });
    const tree = form.render();
    const file = control(tree, "file");
    assert.equal(file.props["aria-invalid"], true);
    const descriptions = String(file.props["aria-describedby"]).split(" ").map(id => nodes(tree).find(node => node.props.id === id));
    assert.equal(descriptions.length, 2);
    assert.ok(descriptions.every(Boolean));
    assert.ok(descriptions.some(node => node!.props.role === "alert"));
  }
  change(form.render(), "file", { files: [new File(["fixture"], "file.zip")] });
  const tree = form.render();
  assert.equal(control(tree, "file").props["aria-invalid"], false);
  assert.equal(String(control(tree, "file").props["aria-describedby"]).split(" ").length, 1);
  assert.equal(nodes(tree).some(node => node.props.role === "alert"), false);
});

test("the error summary remains absent for initial, empty and successful states", () => {
  assert.equal(FormErrorSummary({ fields: [], children: "Stale recovery warning" }), null);
  assert.equal(FormErrorSummary({ fields: [{ id: "field", label: "Field", errors: [] }], children: "Stale recovery warning" }), null);
});

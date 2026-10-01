import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Structural guards, not a substitute for browser/screen-reader testing.
// Inspect each actual control so a sibling's wiring cannot satisfy the guard.

const root = new URL("../src/components/", import.meta.url);
const files = [
  "signup-form.tsx",
  "login-form.tsx",
  "beta-mod-form.tsx",
  "profile-form.tsx",
  "bug-report-form.tsx",
  "approve-uploader-form.tsx",
];
const uploadForm = "build-upload-form.tsx";

function formSource(file: string) {
  return readFileSync(new URL(file, root), "utf8");
}

function errorFields(text: string) {
  return [...new Set([...text.matchAll(/state(?:\?\.|\.)errors(?:\?\.|\.)([A-Za-z]+)/g)].map(match => match[1]))].sort();
}

function inspectForm(text: string) {
  const source = ts.createSourceFile("form.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const controls = new Map<string, Map<string, ts.JsxAttribute>>();
  const declarations = new Map<string, string[]>();
  const described = new Map<string, string[]>();
  const labels = new Set<string>();

  // These forms use literal IDs and `${prefix}-suffix` templates, optionally
  // in conditionals/arrays. Inspect only the requested attribute, keep hyphens,
  // and never count ID declarations as references.
  function ids(attribute: ts.JsxAttribute | undefined): string[] {
    const values: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        values.push(...node.text.split(/\s+/).filter(Boolean));
      } else if (ts.isTemplateExpression(node)) {
        assert.ok(node.templateSpans.length === 1 && node.templateSpans[0].expression.getText(source) === "prefix", "Unsupported dynamic ID pattern");
        values.push(`${node.head.text}\${prefix}${node.templateSpans[0].literal.text}`);
      } else {
        ts.forEachChild(node, visit);
      }
    }
    if (attribute?.initializer) visit(attribute.initializer);
    return values;
  }

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = new Map(node.attributes.properties
        .filter(ts.isJsxAttribute).map(attribute => [attribute.name.getText(source), attribute]));
      const tag = node.tagName.getText(source);
      if (tag === "label") {
        for (const id of ids(attributes.get("htmlFor"))) labels.add(id);
      }
      const name = attributes.get("name")?.initializer;
      if (["input", "select", "textarea"].includes(tag) && name && ts.isStringLiteral(name)) {
        controls.set(name.text, attributes);
        described.set(name.text, ids(attributes.get("aria-describedby")));
      }
      const content = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
        ? node.parent.children.map(child => child.getText(source)).join(" ") : "";
      for (const id of ids(attributes.get("id"))) {
        assert.ok(!declarations.has(id), `Duplicate ID: ${id}`);
        declarations.set(id, errorFields(content));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { fields: errorFields(text), controls, declarations, described, labels };
}

function assertInvalidBindings(text: string) {
  const form = inspectForm(text);
  assert.ok(form.fields.length > 0, "Expected erroring fields");
  for (const field of form.fields) {
    const invalid = form.controls.get(field)?.get("aria-invalid");
    assert.ok(invalid, `${field}: its own control must set aria-invalid`);
    assert.deepEqual(errorFields(invalid.getText()), [field], `${field}: aria-invalid must use its own error`);
  }
}

function assertDescriptionBindings(text: string) {
  const form = inspectForm(text);
  for (const [field, references] of form.described) {
    for (const id of references) {
      assert.ok(form.declarations.has(id), `${field}: aria-describedby references missing ID ${id}`);
    }
  }
  for (const field of form.fields) {
    const references = form.described.get(field) ?? [];
    assert.ok(references.some(id => form.declarations.get(id)?.includes(field)), `${field}: its own control must describe its rendered error`);
  }
}

test("every erroring field sets aria-invalid on its own control", () => {
  for (const file of [...files, uploadForm]) assertInvalidBindings(formSource(file));
});

test("each control describes its rendered error and all help IDs exist", () => {
  for (const file of [...files, uploadForm]) assertDescriptionBindings(formSource(file));
});

test("uploader approval exposes both field errors with instance-specific labelled controls", () => {
  const source = formSource("approve-uploader-form.tsx");
  const form = inspectForm(source);
  assert.deepEqual(form.fields, ["email", "note"]);
  assert.match(source, /const prefix = useId\(\)/);
  for (const field of ["email", "note"]) {
    const id = `\${prefix}-approve-${field}`;
    assert.equal(form.controls.get(field)?.get("id")?.initializer?.getText(), `{\`${id}\`}`);
    assert.ok(form.labels.has(id), `${field}: its label must reference its unique control ID`);
  }
  assertInvalidBindings(source);
  assertDescriptionBindings(source);
});

test("the guard rejects missing or mistyped hyphenated profile error IDs", () => {
  const source = formSource("profile-form.tsx");
  for (const suffix of ["display-name", "avatar-url"]) {
    const declaration = `id={\`\${prefix}-${suffix}-error\`}`;
    assert.ok(source.includes(declaration));
    assert.throws(() => assertDescriptionBindings(source.replace(declaration, "")), /missing ID/);
    assert.throws(() => assertDescriptionBindings(source.replace(declaration, `id={\`\${prefix}-${suffix}-typo\`}`)), /missing ID/);
  }
});

test("the guard rejects aria-invalid borrowed from a sibling control", () => {
  const source = formSource("profile-form.tsx");
  const wrong = source.replace("aria-invalid={Boolean(state?.errors?.displayName)}", "aria-invalid={Boolean(state?.errors?.bio)}");
  assert.notEqual(source, wrong);
  assert.throws(() => assertInvalidBindings(wrong), /displayName: aria-invalid must use its own error/);
});

test("the guard rejects an existing error ID belonging to another field", () => {
  const source = formSource("profile-form.tsx");
  const wrong = source.replace("aria-describedby={state?.errors?.displayName ? `${prefix}-display-name-error` : undefined}", "aria-describedby={state?.errors?.displayName ? `${prefix}-bio-error` : undefined}");
  assert.notEqual(source, wrong);
  assert.throws(() => assertDescriptionBindings(wrong), /displayName: its own control must describe its rendered error/);
});

test("bug filter form remounts uncontrolled selects when normalized filters change", () => {
  const source = formSource("bug-reports.tsx");
  // Static regression guard, not a browser-navigation test.
  assert.match(source, /<form\s+key=\{JSON\.stringify\(\[status\s*\?\?\s*"",\s*buildId\s*\?\?\s*""\]\)\}/);
});

test("not-found page sets a specific metadata title", () => {
  const src = readFileSync(new URL("../src/app/not-found.tsx", import.meta.url), "utf8");
  assert.match(src, /metadata\s*=\s*\{\s*title:\s*"Page not found"\s*\}/);
});

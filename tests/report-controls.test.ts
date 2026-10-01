import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function source(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function elements(root: ts.Node, tag: string) {
  const found: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  function visit(node: ts.Node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === tag) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return node.attributes.properties.filter(ts.isJsxAttribute).find(item => item.name.getText() === name)?.initializer?.getText();
}

// Structural regression guards; these do not invoke a Server Action or claim
// browser interaction coverage.
test("attachment removal requires opening a filename confirmation before a submit exists", () => {
  const tree = source("components/attachment-removal.tsx");
  const forms = elements(tree, "form");
  assert.equal(forms.length, 1);
  const form = forms[0];
  assert.equal(attribute(form, "action"), "{deleteBugAttachment}");
  const guard = form.parent.parent;
  assert.ok(ts.isBinaryExpression(guard));
  assert.equal(guard.left.getText(), "confirmDelete");
  assert.equal(guard.operatorToken.kind, ts.SyntaxKind.AmpersandAmpersandToken);
  assert.match(form.parent.getText(), /\{filename\}/);
  const id = elements(form.parent, "input").find(input => attribute(input, "name") === '"attachmentId"');
  assert.ok(id);
  assert.equal(attribute(id, "value"), "{attachmentId}");

  const trigger = elements(tree, "button").find(button => attribute(button, "aria-expanded") === "{confirmDelete}");
  assert.ok(trigger);
  assert.equal(attribute(trigger, "type"), '"button"');
  assert.equal(attribute(trigger, "onClick"), "{() => setConfirmDelete(true)}");
  assert.match(tree.text, /useState\(false\)/);
});

test("confirmation offers Cancel and disables both controls during removal", () => {
  const tree = source("components/attachment-removal.tsx");
  const controls = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "RemovalButtons");
  assert.ok(controls);
  assert.match(controls.getText(), /useFormStatus\(\)/);
  const buttons = elements(controls, "button");
  assert.equal(buttons.length, 2);
  assert.equal(attribute(buttons[0], "type"), '"submit"');
  assert.match(buttons[0].parent.getText(), /Confirm removal/);
  assert.equal(attribute(buttons[1], "type"), '"button"');
  assert.equal(attribute(buttons[1], "onClick"), "{onCancel}");
  assert.match(buttons[1].parent.getText(), /Cancel/);
  for (const button of buttons) assert.equal(attribute(button, "disabled"), "{pending}");
  const cancel = attribute(elements(tree, "RemovalButtons")[0], "onCancel");
  assert.match(cancel!, /setConfirmDelete\(false\)/);
  assert.match(cancel!, /removeButton\.current\?\.focus\(\)/);
  assert.doesNotMatch(cancel!, /deleteBugAttachment|requestSubmit/);
});

test("report list forwards upload permission and attachment identity to its client controls", () => {
  const tree = source("components/bug-reports.tsx");
  const form = elements(tree, "BugReportForm")[0];
  assert.equal(attribute(form, "uploadPermission"), "{uploadPermission}");
  const removal = elements(tree, "AttachmentRemoval")[0];
  assert.equal(attribute(removal, "attachmentId"), "{attachment.id}");
  assert.equal(attribute(removal, "filename"), "{attachment.filename}");
  assert.match(removal.parent.getText(), /^!readOnly &&/);
});

test("screenshot upload outcome stays outside the upload-availability branch", () => {
  const tree = source("components/mod-media-manager.tsx");
  const manager = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ModMediaManager");
  assert.ok(manager);
  const outcomes = elements(manager, "p").filter(node => attribute(node, "role") === '"status"');
  assert.equal(outcomes.length, 1);
  assert.match(outcomes[0].parent.getText(), /\{state\.message\}/);
  let node: ts.Node | undefined = outcomes[0].parent;
  while (node && node !== manager) {
    assert.ok(!ts.isConditionalExpression(node), "Upload outcome must remain rendered when the last gallery slot is filled");
    if (ts.isJsxElement(node)) assert.notEqual(node.openingElement.tagName.getText(), "form");
    node = node.parent;
  }
});

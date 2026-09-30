import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Source-level placement guards: these do not upload, connect to a database,
// or claim browser verification. Existing pipeline tests cover scan/storage
// outcomes; these pin invalidation to the successful action tail, not a catch.
function source(file: string) {
  const text = readFileSync(new URL(`../lib/${file}`, import.meta.url), "utf8");
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function declaration(tree: ts.SourceFile, name: string) {
  const result = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(result && ts.isFunctionDeclaration(result) && result.body, `Missing action ${name}`);
  return result;
}

function assertCall(statement: ts.Statement, tree: ts.SourceFile, name: string, args?: string[]) {
  assert.ok(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression), `Expected ${name} call`);
  assert.equal(statement.expression.expression.getText(tree), name);
  if (args) assert.deepEqual(statement.expression.arguments.map(argument => argument.getText(tree)), args);
}

function countCalls(node: ts.Node, name: string) {
  let count = 0;
  function visit(item: ts.Node) {
    if (ts.isCallExpression(item) && ts.isIdentifier(item.expression) && item.expression.text === name) count++;
    ts.forEachChild(item, visit);
  }
  visit(node);
  return count;
}

test("build upload refreshes mod and catalog views only in its successful post-cleanup tail", () => {
  const tree = source("build-uploads.ts");
  const action = declaration(tree, "uploadBuild");
  const statements = action.body!.statements;
  const pipeline = statements.at(-6)!;
  assert.ok(ts.isTryStatement(pipeline) && pipeline.catchClause && pipeline.finallyBlock);
  assert.equal(countCalls(pipeline, "revalidatePath"), 0, "Do not invalidate from uncertain storage/error/cleanup paths");
  const paths = ['`/mods/${betaModId}`', '"/browse"', '"/"', '"/dashboard"'];
  paths.forEach((path, index) => assertCall(statements.at(-5 + index)!, tree, "revalidatePath", [path]));
  assertCall(statements.at(-1)!, tree, "redirect", ['`/mods/${betaModId}`']);
  assert.equal(countCalls(action, "revalidatePath"), paths.length);
});

test("submitted bug report refreshes only after its commit/recovery and quarantine cleanup", () => {
  const tree = source("feedback.ts");
  const action = declaration(tree, "submitBugReport");
  const statements = action.body!.statements;
  const pipeline = statements.at(-3)!;
  assert.ok(ts.isTryStatement(pipeline) && pipeline.catchClause && pipeline.finallyBlock);
  assert.equal(countCalls(pipeline, "refreshFeedback"), 0);
  assertCall(statements.at(-2)!, tree, "refreshFeedback", ["betaModId"]);
  assertCall(statements.at(-1)!, tree, "redirect", ["feedbackLocation(betaModId)"]);
  assert.equal(countCalls(action, "refreshFeedback"), 1);
});

test("vote, author response, retest and attachment deletion invalidate only when no error was recorded", () => {
  const tree = source("feedback.ts");
  const cases = [
    ["voteReady", "betaModId"],
    ["respondToBugReport", "report.betaModId"],
    ["retestBugReport", "report.betaModId"],
    ["deleteBugAttachment", "row.attachment.betaModId"],
  ] as const;
  for (const [name, id] of cases) {
    const action = declaration(tree, name);
    const statements = action.body!.statements;
    const guard = statements.at(-2)!;
    assert.ok(ts.isIfStatement(guard));
    assert.equal(guard.expression.getText(tree), "!errorMessage", name);
    assert.equal(guard.elseStatement, undefined);
    assertCall(guard.thenStatement, tree, "refreshFeedback", [id]);
    assertCall(statements.at(-1)!, tree, "redirect");
    assert.equal(countCalls(action, "refreshFeedback"), 1, `${name}: no invalidation in failed/denied paths`);
  }
});

test("feedback invalidation is restricted to affected mod/catalog paths; legacy status redirect does not mutate", () => {
  const tree = source("feedback.ts");
  const refresh = declaration(tree, "refreshFeedback");
  const paths = ['`/mods/${modId}`', '"/browse"', '"/"', '"/dashboard"'];
  assert.equal(refresh.body!.statements.length, paths.length);
  paths.forEach((path, index) => assertCall(refresh.body!.statements[index], tree, "revalidatePath", [path]));
  assert.equal(countCalls(tree, "revalidatePath"), paths.length);
  const legacy = declaration(tree, "setBugReportStatus");
  assert.equal(countCalls(legacy, "refreshFeedback"), 0);
  assert.equal(countCalls(legacy, "revalidatePath"), 0);
});

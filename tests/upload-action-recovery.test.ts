import assert from "node:assert/strict";
import { test } from "node:test";
// The suite uses react-server, so test the installed browser guard without
// importing the public navigation barrel's client hooks.
import { unstable_rethrow } from "next/dist/client/components/unstable-rethrow.browser";
import { notFound } from "next/dist/client/components/not-found";
import { getRedirectError } from "next/dist/client/components/redirect";
import { BUILD_UPLOAD_UNCONFIRMED, BUG_REPORT_UNCONFIRMED, recoverUploadAction } from "../src/lib/upload-action-recovery";

test("upload recovery preserves the original submission and resolved success without another call", async () => {
  const previous = { message: "Earlier validation" };
  const data = new FormData();
  data.set("file", new File(["fixture"], "test.zip"));
  data.set("description", "Original report text");
  const entries = [...data.entries()];
  const success = { message: "Saved" };
  let calls = 0;
  const result = await recoverUploadAction(async (state, form) => {
    calls++;
    assert.equal(state, previous);
    assert.equal(form, data);
    return success;
  }, previous, data, () => assert.fail("No rejection expected"), { message: BUILD_UPLOAD_UNCONFIRMED });
  assert.equal(result, success);
  assert.equal(calls, 1);
  assert.deepEqual([...data.entries()], entries);
});

test("validation state and an empty resolved state pass through unchanged", async () => {
  for (const validation of [{ errors: { description: ["Add more detail."] } }, undefined]) {
    let calls = 0;
    const result = await recoverUploadAction(async () => { calls++; return validation; }, undefined, new FormData(), unstable_rethrow, undefined);
    assert.equal(result, validation);
    assert.equal(calls, 1);
  }
});

test("unexpected rejection is uncertain, private, and never automatically retried", async () => {
  for (const message of [BUILD_UPLOAD_UNCONFIRMED, BUG_REPORT_UNCONFIRMED]) {
    for (const error of [new Error("private error, token and file name"), "private failure", undefined]) {
      let calls = 0;
      const fallback = { message };
      const result = await recoverUploadAction(async () => { calls++; throw error; }, { message: "Old success" }, new FormData(), unstable_rethrow, fallback);
      assert.equal(result, fallback);
      assert.equal(calls, 1);
      assert.match(result.message, /couldn't confirm/);
      assert.match(result.message, /Check .* in a new tab before submitting it again/);
      assert.doesNotMatch(JSON.stringify(result), /private|token|Old success/);
    }
  }
});

test("authentication and successful redirect control flow escape recovery unchanged", async () => {
  const navigations = [
    () => { throw getRedirectError("/login", "replace"); },
    () => { throw getRedirectError("/mods/fixture#testing", "push"); },
    () => notFound(),
  ];
  for (const navigate of navigations) {
    let navigationError: unknown;
    try { navigate(); } catch (error) { navigationError = error; }
    assert.ok(navigationError instanceof Error);
    let calls = 0;
    await assert.rejects(recoverUploadAction(async () => { calls++; throw navigationError; }, undefined, new FormData(), unstable_rethrow, { message: BUG_REPORT_UNCONFIRMED }), error => error === navigationError);
    assert.equal(calls, 1);
  }
});

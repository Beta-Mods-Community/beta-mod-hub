import assert from "node:assert/strict";
import { test } from "node:test";
// Test the installed browser guard directly: this suite's react-server condition
// cannot load the public navigation barrel, which also exports client hooks.
import { unstable_rethrow } from "next/dist/client/components/unstable-rethrow.browser";
import { notFound } from "next/dist/client/components/not-found";
import { getRedirectError } from "next/dist/client/components/redirect";
import { MEDIA_UPLOAD_UNCONFIRMED, recoverMediaUpload } from "../src/lib/media-upload-recovery";

test("media upload recovery forwards original state and form once and preserves successful server state", async () => {
  const previous = { message: "previous validation message" };
  const data = new FormData();
  data.set("file", new File(["harmless fixture"], "sample.webp", { type: "image/webp" }));
  data.set("caption", "Unchanged caption");
  const before = [...data.entries()];
  const success = { ok: true, message: "Screenshot uploaded and scanned." };
  let calls = 0;
  const result = await recoverMediaUpload(async (state, payload) => {
    calls++;
    assert.equal(state, previous); assert.equal(payload, data);
    return success;
  }, previous, data, unstable_rethrow);
  assert.equal(calls, 1); assert.equal(result, success);
  assert.deepEqual([...data.entries()], before);
});

test("ordinary server validation failure remains unchanged without retrying", async () => {
  const validation = { message: "The image exceeds this site's upload limit." };
  let calls = 0;
  const result = await recoverMediaUpload(async () => { calls++; return validation; }, undefined, new FormData(), unstable_rethrow);
  assert.equal(result, validation); assert.equal(calls, 1);
});

test("unexpected rejection returns an honest confirmation warning without raw errors, stale success or retries", async () => {
  for (const failure of [new Error("private provider error and secret-url"), "private rejection", undefined]) {
    let calls = 0;
    const result = await recoverMediaUpload(async () => { calls++; throw failure; }, { ok: true, message: "Old success" }, new FormData(), unstable_rethrow);
    assert.equal(calls, 1);
    assert.equal(result.ok, undefined);
    assert.deepEqual(result, { message: MEDIA_UPLOAD_UNCONFIRMED });
    assert.match(result.message!, /couldn't confirm.*check the gallery before submitting it again/);
    assert.doesNotMatch(JSON.stringify(result), /private|secret|Old success/);
  }
});

test("Next authentication redirects and not-found control flow are rethrown unchanged", async () => {
  for (const navigate of [() => { throw getRedirectError("/login", "replace"); }, () => notFound()]) {
    let navigationError: unknown;
    try { navigate(); } catch (error) { navigationError = error; }
    assert.ok(navigationError instanceof Error);
    let calls = 0;
    await assert.rejects(recoverMediaUpload(async () => { calls++; throw navigationError; }, undefined, new FormData(), unstable_rethrow), error => error === navigationError);
    assert.equal(calls, 1);
  }
});

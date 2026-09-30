import assert from "node:assert/strict";
import { it } from "node:test";
import { validateCloudRuntime, cloudRequestPolicy, createWorkSlot, MAX_BODY_BYTES } from "../scripts/cloud-runtime-policy.mjs";
import { cloudPilotEnabled, makePilotCookie, validPilotCookie, safePilotReturnTo } from "../lib/cloud-pilot";
import { scanBudgetCharge } from "../lib/cloud-scan-budget";
import { validateBuildArchive } from "../lib/build-upload-policy";

const env = {
  NODE_ENV: 'production' as const, CLOUD_PILOT: 'on', PILOT_MODE: 'on', STORAGE_DRIVER: 's3', SCAN_DRIVER: 'transloadit', AUTH_MAIL_MODE: 'resend',
  DATABASE_URL: 'postgresql://user:example@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
  SESSION_SECRET: 's'.repeat(32), PILOT_ACCESS_KEY: 'p'.repeat(32), ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  APP_URL: 'https://example.onrender.com', STORAGE_ENDPOINT: 'https://example.supabase.co/storage/v1/s3',
  STORAGE_REGION: 'us-east-1', STORAGE_BUCKET: 'private-pilot', STORAGE_ACCESS_KEY: 'example', STORAGE_SECRET_KEY: 'example',
  TRANSLOADIT_KEY: 'examplekey', TRANSLOADIT_SECRET: 'example-secret-long-enough', TRANSLOADIT_SIGNATURE_ALGORITHM: 'sha256',
  RESEND_API_KEY: 'example', AUTH_MAIL_FROM: 'Beta Mods <no-reply@example.com>',
};
it('pilot gate preserves verification links without permitting an external redirect', () => {
  assert.equal(safePilotReturnTo('/verify-email?token=synthetic'), '/verify-email?token=synthetic');
  for (const path of ['//evil.example', 'https://evil.example', '/\\evil.example', '/pilot-access', null]) assert.equal(safePilotReturnTo(path), '/');
});
it('cloud startup requires all safety controls, private storage and HTTPS email', () => {
  assert.deepEqual(validateCloudRuntime(env), []);
  for (const key of Object.keys(env)) {
    if (key === 'TRANSLOADIT_SIGNATURE_ALGORITHM') continue;
    assert.ok(validateCloudRuntime({ ...env, [key]: '' }).length, key);
  }
  assert.ok(validateCloudRuntime({ ...env, AUTH_ALLOW_UNVERIFIED_LOCAL: 'true' }).length);
  assert.ok(validateCloudRuntime({ ...env, APP_URL: 'http://example.com' }).length);
  assert.ok(validateCloudRuntime({ ...env, STORAGE_ENDPOINT: 'https://evil.example/storage/v1/s3' }).length);
});
it('cloud safety controls use the same flag aliases as quota enforcement', () => {
  for (const flag of ['on', 'true', '1', 'yes', 'enabled']) assert.equal(cloudPilotEnabled({ CLOUD_PILOT: flag }), true);
  assert.equal(cloudPilotEnabled({}), false);
});
it('pilot cookie is signed, audience-bound, expiring and invalidated by secret rotation', async () => {
  const token = await makePilotCookie(env);
  assert.equal(await validPilotCookie(token, env), true);
  assert.equal(await validPilotCookie(undefined, env), false);
  assert.equal(await validPilotCookie(token + 'x', env), false);
  assert.equal(await validPilotCookie(token, { ...env, PILOT_ACCESS_KEY: 'new'.repeat(20) }), false);
  assert.equal(await validPilotCookie(token, { ...env, SESSION_SECRET: '' }), false);
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(payload.exp - payload.iat, 86400);
  assert.equal(payload.aud, 'betamods-pilot');
});
it('HTTP admission rejects oversized, streaming and unexpected bodies before parsing', () => {
  assert.equal(cloudRequestPolicy('POST', '/', { 'content-length': String(MAX_BODY_BYTES + 1) }).status, 413);
  assert.equal(cloudRequestPolicy('POST', '/', {}).status, 411);
  assert.equal(cloudRequestPolicy('POST', '/', { 'transfer-encoding': 'chunked' }).status, 411);
  assert.equal(cloudRequestPolicy('POST', '/', { 'content-length': '-1' }).status, 400);
  assert.equal(cloudRequestPolicy('GET', '/', { 'content-length': '500' }).status, 400);
  assert.equal(cloudRequestPolicy('POST', '/pilot-access', { 'content-length': '4097' }).status, 413);
  assert.equal(cloudRequestPolicy('PUT', '/', { 'content-length': '0' }).status, 405);
  assert.equal(cloudRequestPolicy('POST', '/', { 'content-length': '100' }).exclusive, true);
  assert.equal(cloudRequestPolicy('GET', '/mods/id/promotion/download', {}).exclusive, true);
  assert.equal(cloudRequestPolicy('GET', '/', {}).exclusive, false);
});
it('one work slot refuses overlap and release is idempotent', () => {
  const slot = createWorkSlot(); const release = slot.take();
  assert.ok(release); assert.equal(slot.take(), null); release();
  const second = slot.take(); assert.ok(second); release(); assert.equal(slot.take(), null); second();
  assert.ok(slot.take());
});
it('managed scanner charges conservatively and rejects out-of-bounds input', () => {
  assert.equal(scanBudgetCharge(1), 3);
  assert.equal(scanBudgetCharge(8 * 1024 * 1024), 27);
  for (const n of [0, -1, NaN, 1.5, 8 * 1024 * 1024 + 1]) assert.throws(() => scanBudgetCharge(n));
});
it('cloud build file chooser rejects other archive formats but local keeps them', () => {
  assert.ok(validateBuildArchive('mod.rar', 100, 1000, true));
  assert.equal(validateBuildArchive('mod.zip', 100, 1000, true), null);
  assert.equal(validateBuildArchive('mod.rar', 100, 1000), null);
});

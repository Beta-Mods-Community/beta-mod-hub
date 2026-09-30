#!/usr/bin/env node
/**
 * Local, synthetic rehearsal of the cloud launcher and built private gate.
 * Requires a CLOUD_PILOT=on build in .next-check. Never uses .env files,
 * accounts, a real database, storage, email or scanner. Port 3999 only.
 * Memory observations cover startup/page reads, not upload capacity.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { request } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const script = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(script));
const port = 3999;
const hostname = '127.0.0.1';
const origin = `http://${hostname}:${port}`;

async function childMain() {
  if (!process.connected) throw new Error('The rehearsal child requires its parent IPC channel.');
  // Next normally discovers local env files even when values are overridden.
  // Refuse reads before importing the launcher or any application modules.
  const envFile = value => typeof value !== 'number' && /^\.env(?:\.|$)/.test(path.basename(String(value)));
  const absent = () => Object.assign(new Error('Environment files are disabled during this rehearsal.'), { code: 'ENOENT' });
  for (const name of ['readFileSync', 'statSync', 'openSync']) {
    const original = fs[name];
    fs[name] = function (target, ...args) {
      if (envFile(target)) throw absent();
      return original.call(this, target, ...args);
    };
  }
  for (const name of ['readFile', 'stat', 'open']) {
    const original = fs.promises[name];
    fs.promises[name] = async function (target, ...args) {
      if (envFile(target)) throw absent();
      return original.call(this, target, ...args);
    };
  }
  // No outbound socket is needed by any request in this suite. Block all of
  // them, including DNS-bound database/provider addresses and local forwards.
  net.Socket.prototype.connect = function () {
    process.send?.({ type: 'outbound-blocked' });
    throw new Error('Outbound network is disabled during this rehearsal.');
  };
  syncBuiltinESMExports();
  const memory = stage => process.send?.({ type: 'memory', stage, ...process.memoryUsage() });
  process.on('message', message => {
    if (message?.type === 'snapshot') memory(message.stage);
  });
  const sampling = setInterval(() => memory('sample'), 100);
  sampling.unref();
  process.chdir(root);
  await import('./cloud-server.mjs');
}

function syntheticEnvironment() {
  const env = {};
  // Pass only operating-system plumbing; never inherit application secrets or
  // NODE_OPTIONS. All application configuration below is synthetic.
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return Object.assign(env, {
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', __NEXT_PROCESSED_ENV: 'true',
    // This environment is passed to spawn, before the child Node starts.
    MALLOC_ARENA_MAX: '2',
    BETAMODS_BUILD_CHECK: '1', PORT: String(port), BIND_HOST: hostname,
    CLOUD_PILOT: 'on', PILOT_MODE: 'on', STORAGE_DRIVER: 's3', SCAN_DRIVER: 'transloadit', AUTH_MAIL_MODE: 'resend',
    DATABASE_URL: 'postgresql://synthetic:unused@ep-rehearsal-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
    SESSION_SECRET: randomBytes(32).toString('hex'), PILOT_ACCESS_KEY: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    APP_URL: 'https://runtime-rehearsal.invalid', STORAGE_ENDPOINT: 'https://runtime-rehearsal.supabase.co/storage/v1/s3',
    STORAGE_REGION: 'us-east-1', STORAGE_BUCKET: 'synthetic-private', STORAGE_ACCESS_KEY: 'synthetic', STORAGE_SECRET_KEY: 'synthetic',
    TRANSLOADIT_KEY: 'synthetic-key', TRANSLOADIT_SECRET: 'synthetic-secret-never-valid', TRANSLOADIT_SIGNATURE_ALGORITHM: 'sha256',
    RESEND_API_KEY: 'synthetic', AUTH_MAIL_FROM: 'Beta Mods <no-reply@runtime-rehearsal.invalid>',
  });
}

async function checkPortAvailable() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(port, hostname, resolve);
  });
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
}

function getResponse(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path: url, method, agent: false, headers }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { res.destroy(); reject(new Error('Unexpectedly large rehearsal response.')); }
        else chunks.push(chunk);
      });
      res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Rehearsal request timed out.')));
    req.once('error', reject);
    req.end(body);
  });
}

async function parentMain() {
  await checkPortAvailable(); // Never attach to an existing service.
  const env = syntheticEnvironment();
  const child = spawn(process.execPath, ['--max-old-space-size=256', script, '--child'], {
    cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const results = []; const memory = []; let outboundAttempts = 0;
  let ready = false; let exited = false; let startupLog = ''; let stderr = '';
  child.once('exit', () => { exited = true; });
  child.stdout.on('data', chunk => {
    startupLog = (startupLog + chunk.toString()).slice(-8192);
    if (startupLog.includes(`Cloud pilot listening on port ${port}`)) ready = true;
  });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  child.on('message', message => {
    if (message?.type === 'memory') memory.push(message);
    if (message?.type === 'outbound-blocked') outboundAttempts++;
  });
  const check = async (name, action) => {
    try { await action(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : 'Check failed.' }); }
  };
  const snapshot = async stage => {
    child.send({ type: 'snapshot', stage });
    for (let attempt = 0; attempt < 20 && !memory.some(item => item.stage === stage); attempt++) await delay(50);
  };
  try {
    for (let attempt = 0; attempt < 300 && !ready && !exited; attempt++) await delay(100);
    if (!ready) throw new Error(`Cloud rehearsal child did not start (${exited ? 'exited' : 'timeout'}; ${stderr.length} stderr characters withheld).`);
    await snapshot('startup');
    await check('GET /pilot-access is available without caching', async () => {
      const response = await getResponse('/pilot-access');
      assert.equal(response.status, 200); assert.match(String(response.headers['cache-control']), /no-store/);
      assert.match(response.text, /Private tester pilot/);
    });
    for (const url of ['/files/synthetic', '/media/synthetic', '/attachments/synthetic', '/mods/synthetic', '/login', '/signup']) {
      await check(`Unauthenticated GET ${url} requires the pilot gate`, async () => {
        const response = await getResponse(url);
        assert.equal(response.status, 307);
        const location = new URL(String(response.headers.location), origin);
        assert.equal(location.origin, env.APP_URL);
        assert.equal(location.pathname, '/pilot-access');
        assert.equal(location.searchParams.get('returnTo'), url);
      });
    }
    await check('Unauthenticated POST is refused before an action', async () => {
      const response = await getResponse('/mods/synthetic', { method: 'POST', headers: { 'Content-Length': '2', 'Content-Type': 'text/plain' }, body: '[]' });
      assert.equal(response.status, 401); assert.match(String(response.headers['cache-control']), /no-store/);
    });
    await check('Over-9-MiB Content-Length is rejected before receiving a body', async () => {
      const response = await getResponse('/mods/synthetic', { method: 'POST', headers: { 'Content-Length': String(9 * 1024 * 1024 + 1) } });
      assert.equal(response.status, 413);
    });
    for (const url of ['/privacy', '/images/rehearsal-missing.png', '/_next/static/rehearsal-missing.js', '/favicon.ico']) {
      await check(`Action-like POST ${url} cannot skip the pilot gate`, async () => {
        const response = await getResponse(url, { method: 'POST', headers: {
          'Content-Length': '2', 'Content-Type': 'text/plain', 'Next-Action': '0'.repeat(40), Origin: origin,
        }, body: '[]' });
        assert.equal(response.status, 401);
      });
    }
    const { SignJWT } = await import('jose');
    const key = createHash('sha256').update(`beta-mods:pilot:${env.SESSION_SECRET}:${env.PILOT_ACCESS_KEY}`).digest();
    const token = await new SignJWT({ gate: true }).setProtectedHeader({ alg: 'HS256' })
      .setAudience('betamods-pilot').setIssuedAt().setExpirationTime('5m').sign(key);
    for (const [url, content] of [['/login', 'Sign in'], ['/signup', 'Create your account']]) {
      await check(`Signed pilot cookie permits ${url} without authenticating an account`, async () => {
        const response = await getResponse(url, { headers: { Cookie: `betamods-pilot=${token}` } });
        assert.equal(response.status, 200); assert.ok(response.text.includes(content));
        assert.match(String(response.headers['cache-control']), /no-store/);
      });
    }
    await check('A forged pilot cookie is rejected', async () => {
      const response = await getResponse('/login', { headers: { Cookie: `betamods-pilot=${token}x` } });
      assert.equal(response.status, 307);
    });
    await snapshot('after-reads');
    await check('No outbound database or provider connections were attempted', async () => assert.equal(outboundAttempts, 0));
  } finally {
    // Only this child PID is touched; no taskkill/node-wide process cleanup.
    if (!exited) child.kill('SIGTERM');
    for (let attempt = 0; attempt < 60 && !exited; attempt++) await delay(100);
    if (!exited) child.kill('SIGKILL');
    for (let attempt = 0; attempt < 20 && !exited; attempt++) await delay(100);
    if (!exited) throw new Error('The rehearsal child did not stop.');
  }
  const mib = value => Math.round(value / 1024 / 1024 * 10) / 10;
  const measurements = ['startup', 'after-reads'].map(stage => {
    const sample = memory.find(item => item.stage === stage);
    return { stage, rssMiB: sample ? mib(sample.rss) : null, heapUsedMiB: sample ? mib(sample.heapUsed) : null };
  });
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
  console.log(JSON.stringify({ measurements, sampledPeakRssMiB: memory.length ? mib(Math.max(...memory.map(item => item.rss))) : null,
    outboundAttempts, childStopped: exited, scope: 'Local startup and page reads only; not evidence of 512 MiB upload capacity.' }));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

try {
  if (process.argv.length === 3 && process.argv[2] === '--child') await childMain();
  else if (process.argv.length === 2) await parentMain();
  else throw new Error('Usage: node scripts/cloud-runtime-smoke.mjs');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloud rehearsal failed.');
  process.exitCode = 1;
}

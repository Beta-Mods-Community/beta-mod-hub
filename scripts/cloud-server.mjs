import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import next from 'next';
import sharp from 'sharp';
import { validateCloudRuntime, cloudRequestPolicy, createWorkSlot } from './cloud-runtime-policy.mjs';
import { createMemoryEvidence } from './cloud-memory.mjs';

const errors = validateCloudRuntime(process.env);
if (errors.length) { console.error('Cloud configuration refused:', errors.join('; ')); process.exit(1); }
const distDir = process.env.BETAMODS_BUILD_CHECK === '1' ? '.next-check' : '.next';
const manifest = JSON.parse(await readFile(`${distDir}/required-server-files.json`, 'utf8'));
if (manifest.config?.experimental?.serverActions?.bodySizeLimit !== '9mb') {
  console.error('Rebuild with CLOUD_PILOT=on before starting the cloud server.'); process.exit(1);
}
// Native decode memory is outside the JS heap: limit worker fan-out and cache.
sharp.concurrency(1); sharp.cache(false);
const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const hostname = process.env.BIND_HOST || '0.0.0.0';
if (!['0.0.0.0', '127.0.0.1'].includes(hostname)) throw new Error('Invalid BIND_HOST');
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();
const slot = createWorkSlot();
const memoryEvidence = createMemoryEvidence();
const server = createServer({ maxHeaderSize: 16384, requestTimeout: 60000, headersTimeout: 10000, keepAliveTimeout: 5000 }, async (req, res) => {
  const policy = cloudRequestPolicy(req.method ?? '', req.url ?? '/', req.headers);
  const release = policy.status === 200 && policy.exclusive ? slot.take() : undefined;
  const status = policy.status !== 200 ? policy.status : release === null ? 503 : 200;
  if (status !== 200) {
    res.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', Connection: 'close', ...(status === 503 ? { 'Retry-After': '30' } : {}) });
    res.end(status === 503 ? 'Another upload or export is in progress. Retry shortly.' : 'Request refused by the small-pilot request limit.');
    return;
  }
  const finishMemory = release ? memoryEvidence.beginExclusive() : undefined;
  const releaseWork = () => { release?.(); finishMemory?.(); };
  let completed = false; let closed = false;
  const finish = () => { closed = true; if (completed) releaseWork(); };
  res.once('finish', finish); res.once('close', finish);
  try { await handle(req, res); }
  catch {
    console.error('Cloud request failed.');
    if (!res.headersSent) { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('Request failed.'); }
    else res.destroy();
  } finally {
    completed = true;
    // Client disconnect alone does not release while a scan/action still runs.
    if (closed || res.writableFinished || res.destroyed) releaseWork();
  }
});
server.maxRequestsPerSocket = 100;
server.listen(port, hostname, () => {
  console.log(`Cloud pilot listening on port ${port}`);
  memoryEvidence.startup();
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(() => { void app.close().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 25000).unref();
});

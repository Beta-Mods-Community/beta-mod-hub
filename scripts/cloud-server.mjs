import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import next from 'next';
import sharp from 'sharp';
import { validateCloudRuntime } from './cloud-runtime-policy.mjs';
import { createMemoryEvidence } from './cloud-memory.mjs';
import { createCloudRequestHandler } from './cloud-http-handler.mjs';

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
// Match Next 16's standard start-server: action redirects fetch the actual
// listener, not HTTPS inferred from Render's TLS-terminating proxy headers.
// This server-only origin never changes APP_URL, request headers or cookies.
process.env.__NEXT_PRIVATE_ORIGIN = `http://127.0.0.1:${port}`;
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();
const memoryEvidence = createMemoryEvidence();
const server = createServer({ maxHeaderSize: 16384, requestTimeout: 60000, headersTimeout: 10000, keepAliveTimeout: 5000 },
  createCloudRequestHandler(handle, {
    beginExclusive: () => memoryEvidence.beginExclusive(),
    onError: () => console.error('Cloud request failed.'),
  }));
server.maxRequestsPerSocket = 100;
server.listen(port, hostname, () => {
  console.log(`Cloud pilot listening on port ${port}`);
  memoryEvidence.startup();
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(() => { void app.close().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 25000).unref();
});

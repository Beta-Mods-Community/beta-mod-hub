import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createMemoryEvidence, memorySnapshot, MAX_MEMORY_SAMPLES, MEMORY_SAMPLE_MS } from '../scripts/cloud-memory.mjs';

const usage = () => ({ rss: 100, heapUsed: 20, heapTotal: 40, external: 30, arrayBuffers: 10 });
const resource = () => ({ maxRSS: 2 });
const snapshot = (rss = 100) => memorySnapshot({ memoryUsage: () => ({ ...usage(), rss }), resourceUsage: resource, platform: 'win32' });

it('memory evidence reads v2 kernel counters and emits only named numeric fields', () => {
  const seen: string[] = [];
  const files: Record<string, string> = {
    '/sys/fs/cgroup/memory.current': '12345\n',
    '/sys/fs/cgroup/memory.peak': '23456\n',
    '/sys/fs/cgroup/memory.max': '536870912\n',
  };
  const result = memorySnapshot({ memoryUsage: usage, resourceUsage: resource, platform: 'linux', readText: (file: string) => { seen.push(file); return files[file]; } });
  assert.deepEqual(result, { ...snapshot(), cgroup: { version: 2, currentBytes: 12345, peakBytes: 23456, maxBytes: 536870912 } });
  assert.equal(result.processPeakRssBytes, 2048);
  assert.deepEqual(seen, Object.keys(files));
});

it('memory evidence supports v1 nested and flat fixed paths without reading arbitrary paths', () => {
  for (const root of ['/sys/fs/cgroup/memory/', '/sys/fs/cgroup/']) {
    const files: Record<string, string> = { [`${root}memory.usage_in_bytes`]: '0', [`${root}memory.max_usage_in_bytes`]: '500', [`${root}memory.limit_in_bytes`]: '1000' };
    const result = memorySnapshot({ memoryUsage: usage, resourceUsage: resource, platform: 'linux', readText: (file: string) => files[file] });
    assert.deepEqual(result.cgroup, { version: 1, currentBytes: 0, peakBytes: 500, maxBytes: 1000 });
  }
});

it('memory evidence treats unlimited, malformed, inaccessible and non-Linux counters as unavailable', () => {
  for (const value of ['max\n', '9223372036854771712', '-2', '1.25', 'NaN', 'secret'.repeat(100)]) {
    const result = memorySnapshot({ memoryUsage: usage, resourceUsage: resource, platform: 'linux', readText: (file: string) => file.endsWith('memory.current') ? '200' : value });
    assert.deepEqual(result.cgroup, { version: 2, currentBytes: 200, peakBytes: null, maxBytes: null });
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
  let reads = 0;
  const result = memorySnapshot({ memoryUsage: () => { throw new Error('private'); }, resourceUsage: () => ({ maxRSS: Infinity }), platform: 'win32', readText: () => { reads++; throw new Error('private'); } });
  assert.equal(reads, 0);
  assert.equal(result.rssBytes, null);
  assert.equal(result.processPeakRssBytes, null);
  assert.equal(result.cgroup.version, 0);
  assert.equal(memorySnapshot({ platform: 'linux', readText: () => { throw new Error('private'); } }).cgroup.version, 0);
});

function harness() {
  const logs: string[] = [];
  let tick: () => void = () => {};
  let clock = 0;
  let rss = 100;
  let cancelled = 0;
  let unrefs = 0;
  const evidence = createMemoryEvidence({
    capture: () => snapshot(rss), write: (line: string) => logs.push(line), now: () => clock,
    schedule: (callback: () => void, ms: number) => { assert.equal(ms, MEMORY_SAMPLE_MS); tick = callback; return { unref: () => { unrefs++; } }; },
    cancel: () => { cancelled++; },
  });
  return { evidence, logs, tick: () => tick(), setRss: (n: number) => { rss = n; }, setClock: (n: number) => { clock = n; }, cancelled: () => cancelled, unrefs: () => unrefs };
}

it('startup and exclusive jobs emit bounded private summaries with sampled peaks', () => {
  const h = harness();
  h.evidence.startup();
  assert.equal(h.logs.length, 1);
  assert.equal(h.cancelled(), 0);
  const finish = h.evidence.beginExclusive();
  assert.equal(h.unrefs(), 1);
  h.setRss(800); h.tick(); h.setRss(200); h.setClock(1200);
  assert.equal(h.logs.length, 1, 'periodic samples do not log');
  finish(); finish(); h.tick();
  assert.equal(h.logs.length, 2, 'finish is idempotent');
  assert.equal(h.cancelled(), 1);
  const summary = JSON.parse(h.logs[1].slice('Cloud memory '.length));
  assert.equal(summary.event, 'exclusive');
  assert.equal(summary.before.rssBytes, 100);
  assert.equal(summary.after.rssBytes, 200);
  assert.equal(summary.sampledPeak.rssBytes, 800);
  assert.equal(summary.elapsedMs, 1200);
  assert.equal(summary.samples, 3);
  assert.equal(summary.samplingCapped, false);
  assert.ok(h.logs.every(line => line.length < 2000));
});

it('stalled work cannot leave an unbounded memory-sampling timer', () => {
  const h = harness();
  const finish = h.evidence.beginExclusive();
  for (let n = 0; n < MAX_MEMORY_SAMPLES * 2; n++) h.tick();
  assert.equal(h.cancelled(), 1);
  assert.equal(h.logs.length, 0);
  finish();
  assert.equal(h.cancelled(), 1);
  const summary = JSON.parse(h.logs[0].slice('Cloud memory '.length));
  assert.equal(summary.samples, MAX_MEMORY_SAMPLES);
  assert.equal(summary.samplingCapped, true);
});

it('unavailable capture and log output never fail startup or finalization', () => {
  const evidence = createMemoryEvidence({ capture: () => { throw new Error('private'); }, write: () => { throw new Error('private'); }, schedule: () => ({ unref() {} }), cancel: () => {} });
  assert.doesNotThrow(() => evidence.startup());
  assert.doesNotThrow(() => { const finish = evidence.beginExclusive(); finish(); finish(); });
});

it('timer creation or cleanup failure cannot change request completion', () => {
  for (const failsOn of ['schedule', 'cancel']) {
    const logs: string[] = [];
    const evidence = createMemoryEvidence({ capture: snapshot, write: (line: string) => logs.push(line), schedule: () => { if (failsOn === 'schedule') throw new Error('private'); return { unref() {} }; }, cancel: () => { throw new Error('private'); } });
    assert.doesNotThrow(() => { const finish = evidence.beginExclusive(); finish(); finish(); });
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes('private'));
  }
});

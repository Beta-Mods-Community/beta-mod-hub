import { readFileSync } from 'node:fs';

export const MEMORY_SAMPLE_MS = 500;
export const MAX_MEMORY_SAMPLES = 600;
const PROCESS_FIELDS = ['rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes', 'processPeakRssBytes'];
const CGROUP_PATHS = [
  [2, '/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory.max'],
  [1, '/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes', '/sys/fs/cgroup/memory/memory.limit_in_bytes'],
  [1, '/sys/fs/cgroup/memory.usage_in_bytes', '/sys/fs/cgroup/memory.max_usage_in_bytes', '/sys/fs/cgroup/memory.limit_in_bytes'],
];
const numeric = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const attempt = read => { try { return read(); } catch { return null; } };

/**
 * Fixed kernel files only; unavailable/unlimited/unsafe values are never guessed.
 * @param {{ memoryUsage?: () => {rss?: number, heapUsed?: number, heapTotal?: number, external?: number, arrayBuffers?: number}, resourceUsage?: () => {maxRSS?: number}, readText?: (file: string) => unknown, platform?: string }} [options]
 */
export function memorySnapshot({
  memoryUsage = () => process.memoryUsage(),
  resourceUsage = () => process.resourceUsage(),
  readText = file => readFileSync(file, 'utf8'),
  platform = process.platform,
} = {}) {
  const usage = attempt(memoryUsage) ?? {};
  const resource = attempt(resourceUsage) ?? {};
  const readNumber = file => {
    const text = attempt(() => readText(file));
    if (typeof text !== 'string' || text.length > 32 || !/^\d+\s*$/.test(text)) return null;
    return numeric(Number(text.trim()));
  };
  let cgroup = { version: 0, currentBytes: null, peakBytes: null, maxBytes: null };
  if (platform === 'linux') {
    for (const [version, current, peak, max] of CGROUP_PATHS) {
      const currentBytes = readNumber(current);
      if (currentBytes === null) continue;
      cgroup = { version, currentBytes, peakBytes: readNumber(peak), maxBytes: readNumber(max) };
      break;
    }
  }
  return {
    rssBytes: numeric(usage.rss), heapUsedBytes: numeric(usage.heapUsed),
    heapTotalBytes: numeric(usage.heapTotal), externalBytes: numeric(usage.external),
    arrayBuffersBytes: numeric(usage.arrayBuffers),
    // Node reports maxRSS in KiB, unlike memoryUsage's byte values. Lifetime,
    // not a resettable per-job peak; cgroup memory.peak has the same caveat.
    processPeakRssBytes: numeric(resource.maxRSS * 1024), cgroup,
  };
}

/**
 * Private logs only. No request metadata enters this interface.
 * @param {{ capture?: () => ReturnType<typeof memorySnapshot>, write?: (line: string) => void, now?: () => number, schedule?: (fn: () => void, ms: number) => {unref?: () => void} | undefined, cancel?: (timer: {unref?: () => void}) => void }} [options]
 */
export function createMemoryEvidence({
  capture = memorySnapshot,
  write = line => console.log(line),
  now = () => performance.now(),
  schedule = (fn, ms) => setInterval(fn, ms),
  cancel = timer => clearInterval(timer),
} = {}) {
  const emit = record => { attempt(() => write(`Cloud memory ${JSON.stringify(record)}`)); };
  const take = () => attempt(capture) ?? memorySnapshot({ memoryUsage: () => ({}), resourceUsage: () => ({}), platform: 'unavailable' });
  return {
    startup() { emit({ event: 'startup', memory: take() }); },
    beginExclusive() {
      const started = now();
      const before = take();
      const sampledPeak = Object.fromEntries(PROCESS_FIELDS.map(key => [key, before[key]]));
      sampledPeak.cgroupCurrentBytes = before.cgroup.currentBytes;
      let samples = 1;
      let finished = false;
      let samplingCapped = false;
      let timer;
      const add = sample => {
        samples += 1;
        for (const key of PROCESS_FIELDS) {
          if (sample[key] !== null) sampledPeak[key] = Math.max(sampledPeak[key] ?? 0, sample[key]);
        }
        if (sample.cgroup.currentBytes !== null) sampledPeak.cgroupCurrentBytes = Math.max(sampledPeak.cgroupCurrentBytes ?? 0, sample.cgroup.currentBytes);
      };
      const stop = () => { if (timer !== undefined) { attempt(() => cancel(timer)); timer = undefined; } };
      timer = attempt(() => schedule(() => {
        if (finished || samplingCapped) return;
        add(take());
        // Reserve one final sample at completion. No timer lives indefinitely
        // if an upstream job stalls; kernel/process lifetime peaks remain useful.
        if (samples >= MAX_MEMORY_SAMPLES - 1) { samplingCapped = true; stop(); }
      }, MEMORY_SAMPLE_MS)) ?? undefined;
      attempt(() => timer?.unref?.());
      return () => {
        if (finished) return;
        finished = true;
        stop();
        const after = take();
        add(after);
        emit({ event: 'exclusive', elapsedMs: numeric(Math.round(now() - started)), samples, samplingCapped, before, after, sampledPeak });
      };
    },
  };
}

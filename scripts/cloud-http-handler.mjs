import { cloudRequestPolicy, createWorkSlot, MAX_BODY_BYTES } from './cloud-runtime-policy.mjs';

// This is a discard allowance, not an accepted-body limit. Requests still fail
// admission at 9 MiB. Never wait indefinitely for an oversized/slow sender.
export const REJECTION_DRAIN_BYTES = MAX_BODY_BYTES + 1024 * 1024;
export const REJECTION_DRAIN_MS = 2000;
export const MAX_REJECTION_DRAINS = 4;
export const REQUEST_REFUSAL = 'Request refused by the small-pilot request limit.';
export const BUSY_REFUSAL = 'Another upload or export is in progress. Retry shortly.';

/**
 * A final response followed immediately by Connection:close can reset a client
 * that is still sending its body, losing the 413 behind a proxy's 502. Send a
 * complete, length-delimited refusal first, then give the bounded incoming
 * stream a chance to finish. Bytes are discarded, never concatenated or sent
 * to Next. The same handling works when the client itself requests close.
 */
export function refuseCloudRequest(req, res, status, allowDrain = true) {
  return new Promise(resolve => {
    const body = status === 503 ? BUSY_REFUSAL : REQUEST_REFUSAL;
    let discardedBytes = 0;
    let finished = false;
    let timer;
    const finish = reason => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req.off('readable', discard);
      req.off('end', ended);
      req.off('aborted', closed);
      res.off('close', closed);
      req.pause();
      if (!res.destroyed && !res.writableEnded) res.end();
      resolve({ reason, discardedBytes });
    };
    const ended = () => finish('complete');
    const closed = () => finish('closed');
    const discard = () => {
      while (!finished && discardedBytes < REJECTION_DRAIN_BYTES) {
        // read(n) bounds the bytes consumed even when a large chunk is queued.
        const chunk = req.read(Math.min(64 * 1024, REJECTION_DRAIN_BYTES - discardedBytes));
        if (chunk === null) break;
        discardedBytes += chunk.length;
      }
      if (discardedBytes === REJECTION_DRAIN_BYTES) finish('byte-limit');
    };
    req.on('readable', discard);
    req.once('end', ended);
    req.once('aborted', closed);
    req.once('error', closed);
    res.once('close', closed);
    timer = setTimeout(() => finish('time-limit'), REJECTION_DRAIN_MS);
    timer.unref();
    res.writeHead(status, {
      'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store', Connection: 'close',
      ...(status === 503 ? { 'Retry-After': '30' } : {}),
    });
    // Deliberately do not end the response until the discard completes or its
    // bounds fire. Content-Length makes the refusal readable immediately.
    res.write(body);
    if (!allowDrain) finish('drain-saturated');
    else if (req.readableEnded) ended();
    else discard();
  });
}

/** Shared runtime admission path; tests supply a harmless handler, not Next. */
export function createCloudRequestHandler(handle, { beginExclusive, onError } = {}) {
  const slot = createWorkSlot();
  let rejectionDrains = 0;
  return async (req, res) => {
    const policy = cloudRequestPolicy(req.method ?? '', req.url ?? '/', req.headers);
    const release = policy.status === 200 && policy.exclusive ? slot.take() : undefined;
    const status = policy.status !== 200 ? policy.status : release === null ? 503 : 200;
    if (status !== 200) {
      // Do not let unauthenticated refusals create an unlimited pool of grace
      // drains. Saturation remains fail-closed with best-effort immediate reply.
      if (rejectionDrains === MAX_REJECTION_DRAINS) return refuseCloudRequest(req, res, status, false);
      rejectionDrains++;
      try { return await refuseCloudRequest(req, res, status); }
      finally { rejectionDrains--; }
    }
    const finishMemory = release ? beginExclusive?.() : undefined;
    const releaseWork = () => { release?.(); finishMemory?.(); };
    let completed = false; let closed = false;
    const finish = () => { closed = true; if (completed) releaseWork(); };
    res.once('finish', finish); res.once('close', finish);
    try { await handle(req, res); }
    catch {
      onError?.();
      if (!res.headersSent) { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('Request failed.'); }
      else res.destroy();
    } finally {
      completed = true;
      // Client disconnect alone does not release while a scan/action still runs.
      if (closed || res.writableFinished || res.destroyed) releaseWork();
    }
  };
}

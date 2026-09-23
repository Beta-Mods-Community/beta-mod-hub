import "server-only";

/**
 * Minimal client for Nexus API v1 read endpoints.
 *
 * STATUS: scaffold. Endpoint paths follow the public Nexus API v1 docs, but
 * nothing here has been validated against the live API. Per the spec's "Nexus
 * integration" rules, once the app is registered these response shapes and
 * rate limits get fixed to match reality (and this note gets replaced with
 * what was verified).
 *
 * Rules from the spec baked in here:
 *  - API only — no browser automation against nexusmods.com.
 *  - Rate-limit aware: reads are cached in-process and paced; 429s honor
 *    Retry-After.
 *  - Read calls are batched/cached — never hit the API per page load (the
 *    dashboard/browse pages must consume this cache, not raw calls).
 *  - Auth: per-user API key from `nexus_links` (see lib/nexus-keys.ts),
 *    never a shared app-wide key.
 */

export type NexusResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; message: string };

// --- Loose response shapes — lock these in against live responses later. ---

/** A game from GET /v1/games.json (subset of the real fields). */
export type NexusGameSummary = {
  domain_name: string;
  name: string;
};

/** A single mod from GET /v1/games/{domain}/mods/{modId}.json (subset). */
export type NexusModSummary = {
  mod_id: number;
  name: string;
  summary?: string;
};

// --- In-process read cache + pacing (per spec's rate-limit rule) ---

const API_BASE = process.env.NEXUS_API_BASE ?? "https://api.nexusmods.com/v1";
const READ_TTL_MS = 5 * 60 * 1000; // cached reads last 5 minutes

const cache = new Map<
  string,
  { data: unknown; expiresAt: number }
>();

let lastRequestAt = 0;
function pace() {
  // Default floor of one request per 500 ms per process. Real per-key limits
  // come from registration; tune with NEXUS_RATE_LIMIT_MS without code changes.
  const minGap = Number(process.env.NEXUS_RATE_LIMIT_MS ?? 500);
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + minGap - now);
  lastRequestAt = now + wait;
  return wait;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawGet(
  path: string,
  apiKey: string,
  retried = false,
): Promise<{ data: unknown; status: number }> {
  const wait = pace();
  if (wait > 0) await sleep(wait);

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      apikey: apiKey,
      Accept: "application/json",
      "User-Agent": "beta-mod-hub (betamods.com) — API-only integration",
    },
    cache: "no-store", // we hold our own read cache on top of the API
  });

  if (res.status === 429 && !retried) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 5);
    await sleep(retryAfter * 1000);
    return rawGet(path, apiKey, true);
  }
  if (!res.ok) {
    throw new Error(`Nexus API ${res.status} for ${path}`);
  }
  return { data: await res.json(), status: res.status };
}

/** Cached GET for public-ish read data (the same data for every user). */
async function nexusGet<T>(path: string, apiKey: string): Promise<NexusResult<T>> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now) {
    return { ok: true, data: hit.data as T };
  }

  try {
    const { data } = await rawGet(path, apiKey);
    cache.set(path, { data, expiresAt: now + READ_TTL_MS });
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error ? err.message : "Nexus API request failed",
    };
  }
}

// --- Read endpoints ---

/** Validates a Nexus API key. Useful at link time. */
export function validateApiKey(apiKey: string): Promise<NexusResult<unknown>> {
  return nexusGet("/users/validate.json", apiKey);
}

export function listGames(
  apiKey: string,
): Promise<NexusResult<NexusGameSummary[]>> {
  return nexusGet("/games.json", apiKey);
}

export function getGame(
  apiKey: string,
  domain: string,
): Promise<NexusResult<unknown>> {
  return nexusGet(`/games/${encodeURIComponent(domain)}.json`, apiKey);
}

export function getMod(
  apiKey: string,
  domain: string,
  modId: number | string,
): Promise<NexusResult<NexusModSummary>> {
  return nexusGet(
    `/games/${encodeURIComponent(domain)}/mods/${encodeURIComponent(String(modId))}.json`,
    apiKey,
  );
}

export function getModFiles(
  apiKey: string,
  domain: string,
  modId: number | string,
): Promise<NexusResult<unknown>> {
  return nexusGet(
    `/games/${encodeURIComponent(domain)}/mods/${encodeURIComponent(String(modId))}/files.json`,
    apiKey,
  );
}
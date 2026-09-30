import "server-only";
import { createHash } from "node:crypto";

/**
 * Experimental Nexus API v1 read client. Live response shapes and limits
 * still need verification before this integration is enabled for users.
 * Requests use each user's credential, with a credential-isolated cache,
 * request pacing and one retry after a 429 response.
 */

export type NexusResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; message: string };

// These response subsets still need validation against the live API.

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
      "User-Agent": "beta-mod-hub (betamods.com)",
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

/** Cache per credential, including endpoints that return account details. */
async function nexusGet<T>(path: string, apiKey: string): Promise<NexusResult<T>> {
  const now = Date.now();
  // Hashing avoids retaining the plaintext credential in cache keys.
  const cacheKey = `${createHash("sha256").update(apiKey).digest("hex")}:${path}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return { ok: true, data: hit.data as T };
  }

  try {
    const { data } = await rawGet(path, apiKey);
    cache.set(cacheKey, { data, expiresAt: now + READ_TTL_MS });
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

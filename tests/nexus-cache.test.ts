import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { listGames, validateApiKey } from "../lib/nexus";

test("Nexus account validation never reuses another credential's cached response", async () => {
  const previousRate = process.env.NEXUS_RATE_LIMIT_MS;
  process.env.NEXUS_RATE_LIMIT_MS = "0";
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    // Constructing Headers also checks that the User-Agent is valid HTTP text.
    const headers = new Headers(init?.headers);
    const key = headers.get("apikey")!;
    calls.push(key);
    if (key === "rejected-test-key") return Response.json({ error: "Invalid key" }, { status: 401 });
    return Response.json({ user_id: key === "first-test-key" ? 1 : 2 });
  });
  try {
    assert.deepEqual(await validateApiKey("first-test-key"), { ok: true, data: { user_id: 1 } });
    assert.deepEqual(await validateApiKey("second-test-key"), { ok: true, data: { user_id: 2 } });
    assert.equal((await validateApiKey("rejected-test-key")).ok, false);
    assert.deepEqual(await validateApiKey("first-test-key"), { ok: true, data: { user_id: 1 } });
    assert.equal(calls.length, 3);
  } finally {
    fetchMock.mock.restore();
    if (previousRate === undefined) delete process.env.NEXUS_RATE_LIMIT_MS;
    else process.env.NEXUS_RATE_LIMIT_MS = previousRate;
  }
});

test("Nexus read results are cached within a credential without crossing credentials", async () => {
  const previousRate = process.env.NEXUS_RATE_LIMIT_MS;
  process.env.NEXUS_RATE_LIMIT_MS = "0";
  let requests = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return Response.json([{ domain_name: "test-game", name: "Test Game" }]);
  });
  try {
    assert.equal((await listGames("first-read-test-key")).ok, true);
    assert.equal((await listGames("first-read-test-key")).ok, true);
    assert.equal(requests, 1);
    assert.equal((await listGames("second-read-test-key")).ok, true);
    assert.equal(requests, 2);
  } finally {
    fetchMock.mock.restore();
    if (previousRate === undefined) delete process.env.NEXUS_RATE_LIMIT_MS;
    else process.env.NEXUS_RATE_LIMIT_MS = previousRate;
  }
});

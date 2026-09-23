#!/usr/bin/env node

/**
 * Standalone virus-scan service the app calls as SCAN_ENDPOINT.
 *
 * Backed by a running ClamAV daemon (clamd). Speaks ClamAV's INSTREAM
 * protocol directly over TCP — zero npm dependencies.
 *
 * Run it (needs ClamAV installed and clamd listening):
 *   node scripts/scan-server.mjs
 *
 * Env:
 *   SCAN_SERVER_PORT  HTTP port to listen on      (default 3311)
 *   CLAMD_HOST        clamd host                  (default 127.0.0.1)
 *   CLAMD_PORT        clamd port                  (default 3310)
 *   SCAN_API_KEY      if set, require `Authorization: Bearer <key>`
 *
 * Protocol (matches lib/scan.ts):
 *   POST /            body = raw file bytes
 *   200 {"clean":true} | {"clean":false,"malware":"Win.Test.EICAR_HDB-1"}
 *   401 bad key | 405 wrong verb/path | 413 too large | 503 clamd error
 */

import { createServer } from "node:http";
import net from "node:net";

const PORT = Number(process.env.SCAN_SERVER_PORT ?? 3311);
const CLAMD_HOST = process.env.CLAMD_HOST ?? "127.0.0.1";
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310);
const API_KEY = process.env.SCAN_API_KEY ?? "";
const MAX_BYTES = 512 * 1024 * 1024;

function scanWithClamav(data) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(CLAMD_PORT, CLAMD_HOST, () => {
      socket.write("zINSTREAM\0");
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < data.length; offset += chunkSize) {
        const chunk = data.subarray(offset, offset + chunkSize);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(Buffer.concat([header, chunk]));
      }
      socket.write(Buffer.alloc(4));
    });

    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(response));
    socket.setTimeout(120_000, () => {
      socket.destroy();
      reject(new Error("clamd timed out"));
    });
  });
}

function parseClamavResponse(response) {
  if (/stream: OK/.test(response)) return { clean: true };
  const match = response.match(/stream:\s+(.+?) FOUND/);
  if (match) return { clean: false, malware: match[1].trim() };
  if (/size limit exceeded|Too many|Error/i.test(response)) {
    throw new Error(`clamd error: ${response.trim()}`);
  }
  throw new Error(`unexpected clamd response: ${response.trim()}`);
}

const server = createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST" || req.url !== "/") {
    send(405, { clean: false, error: "method not allowed" });
    return;
  }

  if (API_KEY && req.headers.authorization !== `Bearer ${API_KEY}`) {
    send(401, { clean: false, error: "unauthorized" });
    return;
  }

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      req.destroy();
      send(413, { clean: false, error: "payload too large" });
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", async () => {
    try {
      const result = await scanWithClamav(Buffer.concat(chunks));
      send(200, parseClamavResponse(result));
    } catch (error) {
      send(503, { clean: false, error: error.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `scan server listening on :${PORT} -> clamd ${CLAMD_HOST}:${CLAMD_PORT}`,
  );
  console.log(`point the app at it with SCAN_ENDPOINT=http://127.0.0.1:${PORT}`);
});
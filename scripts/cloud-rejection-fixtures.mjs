#!/usr/bin/env node
/**
 * Offline-only ZIP-policy fixtures. No credentials, network, scanner calls,
 * extraction, real user files, or hosted uploads. The accepted baseline stays
 * local; accepting its ZIP structure is not a malware-scan verdict.
 *
 * node --conditions=react-server --import tsx scripts/cloud-rejection-fixtures.mjs
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateCloudArchive } from "../lib/cloud-archive.ts";
import { createScanEnvelope } from "../lib/cloud-zip.ts";

export const MAX_FIXTURE_BYTES = 2 * 1024;
const TEXT = Buffer.from("Synthetic Beta Mods archive-policy fixture. Harmless text only.\n", "utf8");
const EXPECTATIONS = [
  { name: "00-valid-baseline-local-only.zip", ok: true, message: "Accepted by local ZIP policy only. Keep this positive baseline local; no malware scan was performed." },
  { name: "01-malformed-metadata.zip", ok: false, message: "This ZIP is malformed or uses unsupported metadata. Re-create a standard ZIP and try again." },
  { name: "02-encrypted-flag.zip", ok: false, message: "Encrypted ZIP files are not supported. Remove the password and try again." },
  { name: "03-nested-benign-zip.zip", ok: false, message: "Nested archives and packed game containers are not supported in the small cloud pilot. Upload an unpacked ZIP instead." },
  { name: "04-crc-mismatch.zip", ok: false, message: "The ZIP failed its integrity check. Re-create the ZIP and try again." },
  { name: "05-unsafe-path.zip", ok: false, message: "The ZIP contains an unsafe or unsupported file path." },
];

/** No input files, output-directory overrides, or live/hosted mode exist. */
export function parseFixtureArgs(args) {
  if (args.length === 0) return { help: false };
  if (args.length === 1 && args[0] === "--help") return { help: true };
  throw new Error("Only --help or no arguments are supported");
}

/** Exactly one harmless positive baseline and five policy-rejection buffers. */
export function createRejectionFixtures() {
  const baseline = createScanEnvelope(TEXT);
  // All offsets are read from our own deterministic, single-member envelope.
  const central = baseline.readUInt32LE(baseline.length - 6);

  const malformed = Buffer.from(baseline);
  malformed.writeUInt16LE(21, 4); // Local version no longer matches the central header.

  const encrypted = Buffer.from(baseline);
  encrypted.writeUInt16LE(1, 6);
  encrypted.writeUInt16LE(1, central + 8); // Flags only: contents remain harmless plaintext.

  const nested = createScanEnvelope(baseline); // Two tiny stored ZIPs, no compression.

  const integrity = Buffer.from(baseline);
  const wrongCrc = (baseline.readUInt32LE(14) ^ 1) >>> 0;
  integrity.writeUInt32LE(wrongCrc, 14);
  integrity.writeUInt32LE(wrongCrc, central + 16); // Headers agree; payload CRC does not.

  const unsafe = Buffer.from(baseline);
  // Same-length member name; the reserved Windows component is policy-invalid.
  // This archive is never extracted, so no reserved path is created on disk.
  const unsafeMember = Buffer.from("nul/log.txt", "ascii");
  if (unsafeMember.length !== baseline.readUInt16LE(26)) throw new Error("Unexpected envelope member length");
  unsafeMember.copy(unsafe, 30);
  unsafeMember.copy(unsafe, central + 46);

  const buffers = [baseline, malformed, encrypted, nested, integrity, unsafe];
  return EXPECTATIONS.map((expected, index) => ({ ...expected, bytes: buffers[index] }));
}

/** Validate every buffer and expected application message before any disk write. */
export async function selfTestRejectionFixtures(fixtures = createRejectionFixtures()) {
  if (fixtures.length !== EXPECTATIONS.length) throw new Error("Expected one baseline and five rejection fixtures");
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    const expected = EXPECTATIONS[index];
    if (fixture.name !== expected.name || fixture.ok !== expected.ok || fixture.message !== expected.message) {
      throw new Error("Fixture plan must match the fixed safe names and expectations");
    }
    if (!Buffer.isBuffer(fixture.bytes) || fixture.bytes.length === 0 || fixture.bytes.length > MAX_FIXTURE_BYTES) {
      throw new Error("Each fixture must contain between 1 and 2048 bytes");
    }
    const result = await validateCloudArchive(fixture.bytes);
    if (result.ok !== expected.ok || !result.ok && (result.reason !== "invalid-archive" || result.message !== expected.message)) {
      throw new Error(`Unexpected local ZIP-policy result for ${expected.name}`);
    }
    if (result.ok && (result.entries !== 1 || result.expandedBytes !== TEXT.length)) {
      throw new Error("Positive baseline must contain exactly the synthetic text payload");
    }
  }
  return fixtures;
}

async function main() {
  if (parseFixtureArgs(process.argv.slice(2)).help) {
    console.log("Offline only: node --conditions=react-server --import tsx scripts/cloud-rejection-fixtures.mjs\nCreates five <=2 KiB policy-rejection ZIPs and one local-only baseline in a fresh temporary directory, after all six pass their intended local validator checks. Does not upload, scan, extract, read user files, or contact any service.");
    return;
  }
  const fixtures = await selfTestRejectionFixtures();
  const directory = await mkdtemp(path.join(os.tmpdir(), "betamods-policy-fixtures-"));
  const manifest = [];
  for (const fixture of fixtures) {
    const destination = path.join(directory, fixture.name);
    await writeFile(destination, fixture.bytes, { flag: "wx" });
    manifest.push({ name: fixture.name, sizeBytes: fixture.bytes.length, expectedMessage: fixture.message, path: destination });
  }
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    console.error("Local ZIP-policy fixture generation failed. No hosted checks were performed.");
    process.exitCode = 1;
  });
}

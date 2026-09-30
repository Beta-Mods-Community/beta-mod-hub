import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { objectStorageConfig, readStorageDriver } from "../lib/storage-config";

const configured = {
  CLOUD_PILOT: "on",
  STORAGE_DRIVER: "s3",
  STORAGE_ENDPOINT: "https://pilot-project.storage.supabase.co/storage/v1/s3",
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "private-pilot",
  STORAGE_ACCESS_KEY: "unit-test-access-key",
  STORAGE_SECRET_KEY: "unit-test-secret",
};

describe("private cloud object storage configuration", () => {
  it("uses Supabase's path-style, explicit-region S3 connection", () => {
    assert.deepEqual(objectStorageConfig(configured), {
      region: "us-east-1",
      endpoint: configured.STORAGE_ENDPOINT,
      credentials: { accessKeyId: configured.STORAGE_ACCESS_KEY, secretAccessKey: configured.STORAGE_SECRET_KEY },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  });

  it("keeps the prior local/R2 behavior when cloud pilot is off", () => {
    assert.equal(readStorageDriver({}), "local");
    const config = objectStorageConfig({ ...configured, CLOUD_PILOT: "off", STORAGE_DRIVER: "r2", STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com", STORAGE_REGION: "" });
    assert.equal(config.region, "auto");
    assert.equal(config.forcePathStyle, undefined);
    assert.equal(config.requestChecksumCalculation, undefined);
  });

  it("does not fall back to local storage on a misspelling", () => {
    assert.throws(() => readStorageDriver({ STORAGE_DRIVER: "supabse" }), /STORAGE_DRIVER/);
  });

  it("requires every server credential and never selects anonymous storage", () => {
    for (const field of ["STORAGE_ENDPOINT", "STORAGE_REGION", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"]) {
      assert.throws(() => objectStorageConfig({ ...configured, [field]: "" }), /Object storage requires/, field);
    }
    assert.throws(() => objectStorageConfig({ ...configured, STORAGE_DRIVER: "local" }), /Local storage/);
    assert.throws(() => objectStorageConfig({ ...configured, STORAGE_DRIVER: "r2" }), /CLOUD_PILOT requires/);
  });

  it("refuses unrelated, public-download, insecure, or credential-bearing endpoints in cloud mode", () => {
    for (const endpoint of [
      "http://pilot-project.supabase.co/storage/v1/s3",
      "https://pilot-project.supabase.co/storage/v1/object/public",
      "https://pilot-project.supabase.co.attacker.test/storage/v1/s3",
      "https://pilot-project.supabase.co:8443/storage/v1/s3",
      "https://access:secret@pilot-project.supabase.co/storage/v1/s3",
      "https://pilot-project.supabase.co/storage/v1/s3?token=test",
      "https://account.r2.cloudflarestorage.com",
    ]) {
      assert.throws(() => objectStorageConfig({ ...configured, STORAGE_ENDPOINT: endpoint }), /STORAGE_ENDPOINT|Supabase/, endpoint);
    }
  });

  it("also accepts the documented non-direct Supabase S3 hostname", () => {
    assert.equal(objectStorageConfig({ ...configured, STORAGE_ENDPOINT: "https://pilot-project.supabase.co/storage/v1/s3" }).forcePathStyle, true);
  });
});

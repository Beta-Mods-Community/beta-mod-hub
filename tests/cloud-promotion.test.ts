import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPromotionMetadataBound,
  CLOUD_PROMOTION_INPUT_LIMIT_BYTES,
  CLOUD_PROMOTION_METADATA_LIMIT_BYTES,
  createPromotionInputBudget,
  type PromotionPackageInput,
} from "../lib/promotion";

function input(): PromotionPackageInput {
  return {
    mod: { id: "test", title: "Test mod", game: "Test game", description: "Short description." },
    build: { versionLabel: "0.1", changelog: null, fileUrl: "builds/test.zip", uploadedAt: new Date(0) },
    requirements: [],
    readStoredFile: async () => { throw new Error("Unit policy tests must not read storage"); },
  };
}

describe("cloud promotion input budget", () => {
  it("charges files, text and per-entry overhead cumulatively", () => {
    const budget = createPromotionInputBudget(true);
    const first = budget.add("files/build.zip", 8 * 1024 * 1024);
    assert.equal(first, 8 * 1024 * 1024 + 1024 + 2 * Buffer.byteLength("files/build.zip"));
    assert.equal(budget.add("description.txt", 10), first + 10 + 1024 + 2 * Buffer.byteLength("description.txt"));
    budget.add("media/1.png", 8 * 1024 * 1024);
    budget.add("media/2.png", 8 * 1024 * 1024);
    assert.throws(() => budget.add("media/3.png", 8 * 1024 * 1024), /32 MiB/);
  });

  it("allows exactly the accounted ceiling and rejects the next entry", () => {
    const budget = createPromotionInputBudget(true);
    const name = "build.zip";
    assert.equal(budget.add(name, CLOUD_PROMOTION_INPUT_LIMIT_BYTES - 1024 - 2 * Buffer.byteLength(name)), CLOUD_PROMOTION_INPUT_LIMIT_BYTES);
    assert.throws(() => budget.add("empty.txt", 0), /32 MiB/);
  });

  it("charges UTF-8 path bytes, not character counts", () => {
    const budget = createPromotionInputBudget(true);
    assert.equal(budget.add("猫.txt", 0), 1024 + 2 * Buffer.byteLength("猫.txt", "utf8"));
  });

  it("rejects nonsensical byte counts and leaves its state unchanged on failure", () => {
    const budget = createPromotionInputBudget(true);
    for (const size of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => budget.add("bad.zip", size), /32 MiB/);
    }
    assert.equal(budget.add("x", 1), 1027);
  });

  it("does not impose the new cloud ceiling on existing non-cloud targets", () => {
    assert.doesNotThrow(() => createPromotionInputBudget(false).add("large.zip", 512 * 1024 * 1024));
  });
});

describe("cloud promotion metadata source bounds", () => {
  it("accepts ordinary build and media metadata", () => {
    const value = input();
    value.requirements.push({ nexusModName: "A dependency", nexusModUrl: "https://example.test/mod" });
    value.media = [{ filename: "test.png", caption: "A screenshot", readStoredFile: value.readStoredFile }];
    assert.doesNotThrow(() => assertPromotionMetadataBound(value, true));
  });

  it("bounds description before markup transformations allocate additional copies", () => {
    const value = input();
    value.mod.description = "a".repeat(CLOUD_PROMOTION_METADATA_LIMIT_BYTES);
    assert.throws(() => assertPromotionMetadataBound(value, true), /1 MiB metadata/);
    assert.doesNotThrow(() => assertPromotionMetadataBound(value, false));
  });

  it("counts captions and requirement fields as UTF-8, not just the description", () => {
    const value = input();
    value.requirements = [{ nexusModName: "猫".repeat(Math.ceil(CLOUD_PROMOTION_METADATA_LIMIT_BYTES / 3)), nexusModUrl: null }];
    assert.throws(() => assertPromotionMetadataBound(value, true), /1 MiB metadata/);
    value.requirements = [];
    value.media = [{ filename: "test.png", caption: "a".repeat(CLOUD_PROMOTION_METADATA_LIMIT_BYTES), readStoredFile: value.readStoredFile }];
    assert.throws(() => assertPromotionMetadataBound(value, true), /1 MiB metadata/);
  });

  it("bounds pathological arrays of empty metadata fields", () => {
    const value = input();
    value.requirements = Array.from({ length: CLOUD_PROMOTION_METADATA_LIMIT_BYTES / 32 }, () => ({ nexusModName: "", nexusModUrl: null }));
    assert.throws(() => assertPromotionMetadataBound(value, true), /1 MiB metadata/);
  });
});

import assert from "node:assert/strict";
import { before, test } from "node:test";

type Rehearsal = typeof import("../scripts/cloud-export-rehearsal.mjs");
let boundarySourceSizes: Rehearsal["boundarySourceSizes"];
let rehearsalEnvironment: Rehearsal["rehearsalEnvironment"];
before(async () => {
  ({ boundarySourceSizes, rehearsalEnvironment } = await import("../scripts/cloud-export-rehearsal.mjs"));
});

const root = "promotion-export-boundary";
const calibration = () => [
  ...["description.bbcode.txt", "summary.txt", "readme.txt", "changelog.txt", "requirements.txt", "media/captions.txt"].map(name => ({ name: `${root}/${name}`, bytes: 100 })),
  { name: `${root}/files/build.zip`, bytes: 1 },
  ...["first", "second", "third"].map((name, index) => ({ name: `${root}/media/0${index + 1}-${name}.webp`, bytes: 1 })),
];

test("export fixture accounts real metadata and overhead at exactly 32 MiB", () => {
  const plan = boundarySourceSizes(calibration());
  assert.equal(plan.accountedBytes, 32 * 1024 * 1024);
  assert.equal(plan.fixedBytes + plan.sizes.reduce((total: number, bytes: number) => total + bytes, 0), plan.accountedBytes);
  assert.ok(plan.sizes.every((bytes: number) => bytes > 0 && bytes <= 8 * 1024 * 1024));
  assert.ok(plan.sizes[3] + 1 <= 8 * 1024 * 1024, "over-budget refusal is cumulative, not a per-file violation");
});

test("calibration rejects duplicate, missing, invalid or non-unit source entries", () => {
  const duplicate = calibration(); duplicate[0] = duplicate[1];
  const large = calibration(); large[6].bytes = 8 * 1024 * 1024;
  const invalid = calibration(); invalid[0].bytes = NaN;
  for (const entries of [calibration().slice(1), duplicate, large, invalid]) assert.throws(() => boundarySourceSizes(entries));
});

test("rehearsal child receives no credentials, preload hooks or provider environment", () => {
  const env = rehearsalEnvironment("synthetic-scratch", {
    PATH: "system-path", DATABASE_URL: "must-not-inherit", SESSION_SECRET: "must-not-inherit",
    NODE_OPTIONS: "must-not-inherit", TRANSLOADIT_SECRET: "must-not-inherit", STORAGE_SECRET_KEY: "must-not-inherit",
    AUTH_ALLOW_UNVERIFIED_LOCAL: "must-not-inherit", RENDER: "must-not-inherit",
  });
  assert.equal(env.PATH, "system-path");
  assert.equal(env.CLOUD_PILOT, "on");
  assert.equal(env.TMPDIR, "synthetic-scratch");
  assert.equal(Object.values(env).includes("must-not-inherit"), false);
});

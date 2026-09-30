import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthorResponseSchema, canReadAttachment, MAX_ATTACHMENT_BYTES, RetestSchema, validateAttachment, validateAttachmentContents, validateVoteBuild } from "../lib/feedback-policy";
import { assertDeletableMod, assertEditableMod, ModMutationError } from "../lib/mod-lifecycle";
import { validateBuildArchive } from "../lib/build-upload-policy";

const firstBuild = "ea350b18-d729-4d81-a264-e936a258984c";
const secondBuild = "680ae994-49d4-4979-a2e9-799078729222";

describe("feedback tied to the tested build", () => {
  it("accepts the displayed current build and refuses a stale vote instead of retargeting it", () => {
    assert.equal(validateVoteBuild(firstBuild, firstBuild), null);
    assert.match(validateVoteBuild(firstBuild, secondBuild)!, /vote was not saved/);
    assert.match(validateVoteBuild(firstBuild, undefined)!, /no build/);
    assert.match(validateVoteBuild("not-a-uuid", firstBuild)!, /Choose/);
  });
  it("requires a structured owner update and a real build on reporter retests", () => {
    assert.equal(AuthorResponseSchema.safeParse({ status: "fixed", response: "Fixed the crash in the new build.", requestRetest: true }).success, true);
    assert.equal(AuthorResponseSchema.safeParse({ status: "fixed", response: " ", requestRetest: true }).success, false);
    assert.equal(RetestSchema.safeParse({ buildId: firstBuild, result: "still-present", notes: "Same crash after loading." }).success, true);
    assert.equal(RetestSchema.safeParse({ buildId: "anything", result: "resolved", notes: "" }).success, false);
  });
});

describe("private scanned attachment policy", () => {
  it("gives the same archive preflight errors to the form and server", () => {
    assert.equal(validateBuildArchive("mod.tar.gz", 100, 1000), null);
    assert.match(validateBuildArchive("mod.exe", 100, 1000)!, /Package the mod/);
    assert.match(validateBuildArchive("mod.zip", 1001, 1000)!, /limit/);
    assert.match(validateBuildArchive("mod.zip", 0, 1000)!, /non-empty/);
  });
  it("caps attachment size and permits only supported diagnostic formats", () => {
    for (const name of ["crash.LOG", "save.sav", "save.fos", "details.zip", "config.ini"]) assert.equal(validateAttachment(name, 100), null);
    // Loadable plugin formats are refused: the author is invited to run any
    // uploaded attachment, so ClamAV alone is not a sufficient gate for them.
    for (const name of ["save.ess", "plugin.skse", "mod.esm"]) assert.match(validateAttachment(name, 100) ?? "", /supported game save/);
    assert.equal(validateAttachment("log.txt", MAX_ATTACHMENT_BYTES), null);
    assert.match(validateAttachment("log.txt", MAX_ATTACHMENT_BYTES + 1)!, /20 MiB/);
    assert.match(validateAttachment("log.txt", 0)!, /non-empty/);
    for (const name of ["run.exe", "log.txt.exe", "unsafe.html", "script.js", "README"]) assert.ok(validateAttachment(name, 100));
  });
  it("does not accept another file renamed as a ZIP", () => {
    assert.equal(validateAttachmentContents("archive.zip", new Uint8Array([80, 75, 3, 4, 0])), null);
    assert.match(validateAttachmentContents("archive.zip", new Uint8Array([77, 90, 0, 0]))!, /not a valid ZIP/);
  });
  it("only grants attachment access to reporter and mod owner", () => {
    assert.equal(canReadAttachment(undefined, "reporter", "owner"), false);
    assert.equal(canReadAttachment("stranger", "reporter", "owner"), false);
    assert.equal(canReadAttachment("reporter", "reporter", "owner"), true);
    assert.equal(canReadAttachment("owner", "reporter", "owner"), true);
  });
});

describe("server-side mod lifecycle policy", () => {
  it("allows owners to delete active or archived mods without making archived mods editable", () => {
    for (const status of ["alpha", "beta", "rc", "abandoned"]) {
      assert.doesNotThrow(() => assertDeletableMod({ ownerId: "owner", status }, "owner"));
    }
    assert.throws(() => assertEditableMod({ ownerId: "owner", status: "abandoned" }, "owner"), /archived and is read-only/);
  });
  it("denies deletion by nonowners even when the mod is archived", () => {
    for (const status of ["beta", "abandoned"]) {
      assert.throws(() => assertDeletableMod({ ownerId: "owner", status }, "tester"), /Only the mod author/);
    }
  });
  it("still denies owner deletion of published or moderation-hidden mods", () => {
    assert.throws(() => assertDeletableMod({ ownerId: "owner", status: "promoted" }, "owner"), /published on Nexus and is read-only/);
    for (const status of ["beta", "abandoned"]) {
      assert.throws(() => assertDeletableMod({ ownerId: "owner", status, hiddenAt: new Date() }, "owner"), /under review/);
    }
  });
  it("denies deletion when the mod no longer exists", () => {
    for (const mod of [null, undefined]) {
      assert.throws(() => assertDeletableMod(mod, "owner"), /no longer available/);
    }
  });
  it("allows active owned mutations but rejects wrong owner, published, archived, missing or hidden mods", () => {
    assert.doesNotThrow(() => assertEditableMod({ ownerId: "owner", status: "beta" }, "owner"));
    assert.throws(() => assertEditableMod({ ownerId: "owner", status: "beta" }, "tester"), ModMutationError);
    for (const status of ["promoted", "abandoned"]) assert.throws(() => assertEditableMod({ ownerId: "owner", status }), /read-only/);
    assert.throws(() => assertEditableMod(null), /no longer available/);
    assert.throws(() => assertEditableMod({ ownerId: "owner", status: "beta", hiddenAt: new Date() }), /under review/);
  });
});

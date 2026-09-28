import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BugReportFormSchema, ProfileFormSchema } from "../lib/definitions";

describe("BugReportFormSchema", () => {
  const validReport = {
    buildId: "018fef4c-54f8-7f16-8c35-4c83f18b47df",
    severity: "major",
    description: "The menu freezes after selecting a background.",
    reproSteps: "Open the menu and select the second background.",
  };

  it("requires a valid affected build id", () => {
    assert.equal(BugReportFormSchema.safeParse(validReport).success, true);
    assert.equal(
      BugReportFormSchema.safeParse({ ...validReport, buildId: "" }).success,
      false,
    );
    assert.equal(
      BugReportFormSchema.safeParse({ ...validReport, buildId: "not-a-uuid" })
        .success,
      false,
    );
  });
});

describe("ProfileFormSchema", () => {
  it("accepts a minimal valid profile", () => {
    const result = ProfileFormSchema.safeParse({
      displayName: "Demo Tester",
      bio: "",
      avatarUrl: "",
    });
    assert.equal(result.success, true);
    if (result.success) {
      // Empty avatar URL maps to null so the DB stores NULL, not "".
      assert.equal(result.data.avatarUrl, null);
      assert.equal(result.data.bio, "");
    }
  });

  it("accepts a full profile with bio and avatar", () => {
    const result = ProfileFormSchema.safeParse({
      displayName: "  Demo Tester  ",
      bio: "  Tests combat mods.  ",
      avatarUrl: "https://example.com/avatar.png",
    });
    assert.equal(result.success, true);
    if (result.success) {
      // Whitespace is trimmed.
      assert.equal(result.data.displayName, "Demo Tester");
      assert.equal(result.data.bio, "Tests combat mods.");
      assert.equal(result.data.avatarUrl, "https://example.com/avatar.png");
    }
  });

  it("rejects a display name that is too short", () => {
    const result = ProfileFormSchema.safeParse({
      displayName: "A",
      bio: "",
      avatarUrl: "",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.flatten().fieldErrors.displayName);
    }
  });

  it("rejects a bio over 1000 characters", () => {
    const result = ProfileFormSchema.safeParse({
      displayName: "Demo Tester",
      bio: "x".repeat(1001),
      avatarUrl: "",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.flatten().fieldErrors.bio);
    }
  });

  it("rejects a non-URL avatar", () => {
    const result = ProfileFormSchema.safeParse({
      displayName: "Demo Tester",
      bio: "",
      avatarUrl: "not a url",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.flatten().fieldErrors.avatarUrl);
    }
  });
});

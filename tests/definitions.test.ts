import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BetaModFormSchema,
  BugReportFormSchema,
  BuildUploadFormSchema,
  ProfileFormSchema,
  RequirementFormSchema,
  SignupFormSchema,
} from "../lib/definitions";

const requiredTextCases = [
  {
    name: "signup display name",
    schema: SignupFormSchema,
    input: { displayName: "Tester", email: "tester@example.test", password: "fixture-password-only" },
    field: "displayName", min: 2, max: 40,
  },
  {
    name: "profile display name",
    schema: ProfileFormSchema,
    input: { displayName: "Tester", bio: "", avatarUrl: "" },
    field: "displayName", min: 2, max: 40,
  },
  {
    name: "mod title",
    schema: BetaModFormSchema,
    input: { title: "Test mod", game: "Skyrim", tags: "", description: "", status: "beta" },
    field: "title", min: 3, max: 80,
  },
  {
    name: "game name",
    schema: BetaModFormSchema,
    input: { title: "Test mod", game: "Skyrim", tags: "", description: "", status: "beta" },
    field: "game", min: 1, max: 60,
  },
  {
    name: "requirement name",
    schema: RequirementFormSchema,
    input: { nexusModName: "Required mod", nexusModUrl: "" },
    field: "nexusModName", min: 1, max: 120,
  },
  {
    name: "build version",
    schema: BuildUploadFormSchema,
    input: { versionLabel: "0.1", changelog: "" },
    field: "versionLabel", min: 1, max: 40,
  },
  {
    name: "bug description",
    schema: BugReportFormSchema,
    input: {
      buildId: "018fef4c-54f8-7f16-8c35-4c83f18b47df",
      severity: "major",
      description: "The menu freezes after selecting a background.",
      reproSteps: "",
    },
    field: "description", min: 10, max: 4000,
  },
];

for (const { name, schema, input, field, min, max } of requiredTextCases) {
  describe(`Required text: ${name}`, () => {
    it("rejects whitespace-only input with an error on the field", () => {
      for (const value of ["", " ".repeat(min), "\t\r\n", "\u00a0\u2003".repeat(min)]) {
        const result = schema.safeParse({ ...input, [field]: value });
        assert.equal(result.success, false);
        if (!result.success) {
          assert.ok(result.error.issues.some((issue) => issue.path[0] === field));
        }
      }
    });

    it("does not count surrounding whitespace toward the minimum", () => {
      const result = schema.safeParse({ ...input, [field]: `  ${"x".repeat(min - 1)}  ` });
      assert.equal(result.success, false);
    });

    it("accepts and trims text at the minimum and maximum lengths", () => {
      for (const length of [min, max]) {
        const value = "x".repeat(length);
        const result = schema.safeParse({ ...input, [field]: ` \t${value}\n ` });
        assert.equal(result.success, true);
        if (result.success) {
          const data: Record<string, unknown> = result.data;
          assert.equal(data[field], value);
        }
      }
    });

    it("rejects text beyond the maximum after trimming", () => {
      const result = schema.safeParse({ ...input, [field]: ` ${"x".repeat(max + 1)} ` });
      assert.equal(result.success, false);
    });
  });
}

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

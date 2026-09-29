import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const stylesheet = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function luminance(token: string) {
  const value = stylesheet.match(new RegExp(`--${token}:\\s*#([a-f0-9]{6});`, "i"))?.[1];
  assert.ok(value, `Missing solid color token: ${token}`);
  const [r, g, b] = value.match(/../g)!.map((channel) => {
    const srgb = parseInt(channel, 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("shared text and links keep readable contrast on every neutral surface", () => {
  for (const surface of ["background", "surface", "surface-raised", "surface-soft"]) {
    for (const text of ["text", "text-soft", "muted", "accent", "accent-strong"]) {
      assert.ok(contrast(text, surface) >= 4.5, `${text} on ${surface} must reach 4.5:1`);
    }
  }
});

test("primary buttons retain readable text in normal and hover states", () => {
  for (const background of ["accent", "accent-strong"]) {
    assert.ok(contrast("accent-contrast", background) >= 4.5);
  }
});

test("field boundaries and keyboard focus remain distinguishable", () => {
  for (const surface of ["surface", "surface-soft"]) {
    assert.ok(contrast("line-strong", surface) >= 3, `Field boundary on ${surface} must reach 3:1`);
    assert.ok(contrast("accent", surface) >= 3, `Focus ring on ${surface} must reach 3:1`);
  }
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("site components use brand tokens instead of competing blue palettes", () => {
  for (const path of sourceFiles(fileURLToPath(new URL("../src", import.meta.url)))) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\b(?:bg|text|border|ring|outline|from|via|to)-(?:cyan|teal|sky|blue)-\d+/, path);
  }
});

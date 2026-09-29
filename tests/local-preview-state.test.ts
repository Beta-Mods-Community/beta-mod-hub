import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const windows = process.platform === "win32";
const windowsPowerShell = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
);
const pwsh = windows
  ? spawnSync("pwsh.exe", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], { encoding: "utf8", timeout: 10_000, windowsHide: true })
  : null;

for (const [label, executable, available] of [
  ["Windows PowerShell 5.1", windowsPowerShell, windows && existsSync(windowsPowerShell)],
  ["PowerShell 7", "pwsh.exe", windows && pwsh?.status === 0],
] as const) {
  test(`preview process state stays flat and rejects unsafe identities (${label})`, { skip: !available }, () => {
    const result = spawnSync(executable, [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.resolve("tests/helpers/local-preview-state.ps1"),
    ], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Preview-state checks passed/);
  });
}

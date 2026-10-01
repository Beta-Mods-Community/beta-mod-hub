import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("restore lifecycle commands do not pass exec-only TTY flags to Compose", () => {
  const source = readFileSync(new URL("../scripts/home-restore.ps1", import.meta.url), "utf8");
  const commands = source.match(/^& docker compose .+$/gm) ?? [];
  assert.equal(commands.length, 2, "Both stack shutdown and startup are checked");
  for (const command of commands) {
    assert.doesNotMatch(command, /\s(?:-T|--no-TTY)(?:\s|$)/);
  }
  assert.match(commands[0], /\sdown\s+\| Out-Host/);
  assert.match(commands[1], /\sup -d\s+\| Out-Host/);
});

const windows = process.platform === "win32";
const windowsPowerShell = path.join(process.env.SystemRoot || "C:\\Windows",
  "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const pwshExecutable = windows ? "pwsh.exe" : "pwsh";
const pwsh = spawnSync(pwshExecutable, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
  encoding: "utf8", timeout: 10_000, windowsHide: true,
});

for (const [label, executable, available] of [
  ["Windows PowerShell 5.1", windowsPowerShell, windows && existsSync(windowsPowerShell)],
  ["PowerShell 7", pwshExecutable, pwsh.status === 0],
] as const) {
  test(`restore dry-run keeps the complete latest backup date (${label})`, { skip: !available }, (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "betamods-restore-plan-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    for (const stamp of ["2026-09-28", "2026-10-01"]) {
      for (const name of [`neon-${stamp}.dump`, `app-data-${stamp}.tgz`, `r2-inventory-${stamp}.json`]) {
        writeFileSync(path.join(directory, name), "synthetic filename fixture; not a backup");
      }
    }
    // A saved audit and malformed names must not shadow dated backups.
    for (const name of ["r2-inventory-now.json", "neon-not-a-date.dump", "app-data-not-a-date.tgz"]) {
      writeFileSync(path.join(directory, name), "synthetic filename fixture");
    }
    const result = spawnSync(executable, [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.resolve("tests/helpers/home-restore-plan.ps1"), "-BackupDir", directory,
    ], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /using most recent: 2026-10-01/);
    assert.match(result.stdout, /app-data-2026-10-01\.tgz/);
    assert.match(result.stdout, /neon-2026-10-01\.dump/);
    assert.match(result.stdout, /dry run only -- nothing was changed/);
  });
}

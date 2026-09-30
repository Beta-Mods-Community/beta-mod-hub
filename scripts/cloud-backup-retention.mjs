/** Bounded, workflow-owned retention. Never deletes an existing good copy first. */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BACKUP_REPOSITORY = "Beta-Mods/beta-mod-hub";
export const BACKUP_WORKFLOW = ".github/workflows/cloud-backup.yml";
export const MIB = 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 150 * MIB;
// Leave room for upload-artifact's ZIP framing around the encrypted file.
export const MAX_ENCRYPTED_BYTES = 149 * MIB;
export const MAX_REPOSITORY_ARTIFACT_BYTES = 450 * MIB;

export function parseBackupName(name) {
  const match = /^cloud-backup-v1-([1-9][0-9]*)-([1-9][0-9]*)$/.exec(name ?? "");
  if (!match) return null;
  const runId = Number(match[1]);
  const attempt = Number(match[2]);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(attempt)) return null;
  return { runId, attempt };
}

export function artifactBudget(artifacts, reserveBytes = MAX_ARTIFACT_BYTES) {
  if (!Array.isArray(artifacts)) throw new Error("Artifact inventory is not an array.");
  let totalBytes = 0;
  const ids = new Set();
  for (const artifact of artifacts) {
    if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || ids.has(artifact.id) ||
        typeof artifact.expired !== "boolean" ||
        !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0) {
      throw new Error("Artifact inventory has missing, duplicated or invalid accounting.");
    }
    ids.add(artifact.id);
    if (!artifact.expired) totalBytes += artifact.size_in_bytes;
  }
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0 ||
      !Number.isSafeInteger(totalBytes) || totalBytes + reserveBytes > MAX_REPOSITORY_ARTIFACT_BYTES) {
    throw new Error("Artifact budget would exceed the 450 MiB repository ceiling; no copies removed.");
  }
  return totalBytes;
}

export function preflightArtifactBudget(artifacts) {
  const total = artifactBudget(artifacts);
  // Even a tiny orphan can otherwise let repeated failures accumulate copies.
  // A lookalike name may conservatively block creation, but is never deleted here.
  if (artifacts.filter((artifact) => !artifact.expired && parseBackupName(artifact.name)).length > 2) {
    throw new Error("More than two backup artifacts already exist; inspect them before another snapshot.");
  }
  return total;
}

/** The caller obtains each exact attempt from GitHub, not from artifact names alone. */
export function isOwnedArtifact(artifact, run) {
  const parsed = parseBackupName(artifact.name);
  return Boolean(parsed && !artifact.expired && run &&
    parsed.runId === artifact.workflow_run?.id && parsed.runId === run.id &&
    parsed.attempt === run.run_attempt && run.path === BACKUP_WORKFLOW &&
    run.repository?.full_name === BACKUP_REPOSITORY && run.head_branch === "main" &&
    ["schedule", "workflow_dispatch"].includes(run.event));
}

/** Keep replacement + newest prior successful snapshot; unknown artifacts are untouchable. */
export function planRetention(artifacts, runs, currentId, currentRunId, currentAttempt, verified) {
  if (verified !== true) throw new Error("Downloaded replacement has not passed restore verification.");
  artifactBudget(artifacts, 0);
  const current = artifacts.find((artifact) => artifact.id === currentId);
  const runFor = (artifact) => {
    const parsed = parseBackupName(artifact.name);
    return parsed ? runs.get(`${parsed.runId}:${parsed.attempt}`) : undefined;
  };
  if (!current || !isOwnedArtifact(current, runFor(current)) ||
      current.workflow_run.id !== currentRunId || parseBackupName(current.name).attempt !== currentAttempt ||
      current.size_in_bytes > MAX_ARTIFACT_BYTES) {
    throw new Error("Replacement artifact identity, provenance or size is invalid.");
  }
  const previous = artifacts.filter((artifact) => artifact.id !== currentId &&
    isOwnedArtifact(artifact, runFor(artifact)) && runFor(artifact).status === "completed");
  // IDs increase with creation, but use a validated creation time as the primary order.
  for (const artifact of previous) {
    if (!Number.isFinite(Date.parse(artifact.created_at))) throw new Error("Invalid artifact creation time.");
  }
  const good = previous.filter((artifact) => runFor(artifact).conclusion === "success")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const keepIds = new Set([currentId, ...good.slice(0, 1).map((artifact) => artifact.id)]);
  return {
    keepIds: [...keepIds],
    deleteIds: previous.filter((artifact) => !keepIds.has(artifact.id)).map((artifact) => artifact.id),
  };
}

function context(env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== BACKUP_REPOSITORY ||
      env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== `${BACKUP_REPOSITORY}/${BACKUP_WORKFLOW}@refs/heads/main` ||
      !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error("Backup retention is restricted to the approved main-branch workflow.");
  }
  const runId = Number(env.GITHUB_RUN_ID);
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(attempt) || attempt < 1 ||
      !env.GITHUB_TOKEN) throw new Error("Missing workflow identity or token.");
  return { runId, attempt };
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  if (command === "check-file") {
    const info = await stat(argument);
    if (!info.isFile() || info.size < 1 || info.size > MAX_ENCRYPTED_BYTES) {
      throw new Error("Encrypted snapshot exceeds the 149 MiB upload payload limit.");
    }
    console.log(`Encrypted snapshot size checked: ${info.size} bytes.`);
    return;
  }
  if (!["preflight", "prune", "discard-current"].includes(command)) throw new Error("Unknown retention command.");
  const { runId, attempt } = context(process.env);
  const api = async (path, method = "GET") => {
    // Paths are constructed exclusively below from fixed constants / validated numeric IDs.
    const response = await fetch(`https://api.github.com/repos/${BACKUP_REPOSITORY}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28" },
      redirect: "error", signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub artifact operation failed (${response.status}); no fallback.`);
    if (method === "DELETE") return null;
    const text = await response.text();
    if (text.length > 2 * MIB) throw new Error("GitHub inventory response exceeded its bound.");
    return JSON.parse(text);
  };
  const artifacts = [];
  let expectedCount;
  for (let page = 1; page <= 20; page += 1) {
    const result = await api(`/actions/artifacts?per_page=100&page=${page}`);
    if (!Array.isArray(result.artifacts) || !Number.isSafeInteger(result.total_count)) {
      throw new Error("GitHub artifact inventory shape is invalid.");
    }
    expectedCount ??= result.total_count;
    if (expectedCount !== result.total_count) throw new Error("Artifact inventory changed during accounting; retry later.");
    artifacts.push(...result.artifacts);
    if (result.artifacts.length < 100) break;
  }
  if (artifacts.length !== expectedCount) throw new Error("Artifact inventory is incomplete; refusing to guess usage.");
  if (command === "preflight") {
    const total = preflightArtifactBudget(artifacts);
    console.log(`Artifact preflight passed: ${total} existing bytes + 150 MiB reserved.`);
    return;
  }
  const currentId = Number(argument);
  if (!Number.isSafeInteger(currentId) || currentId < 1) throw new Error("Invalid current artifact ID.");
  const runs = new Map();
  for (const artifact of artifacts) {
    const parsed = parseBackupName(artifact.name);
    if (!parsed || artifact.expired) continue;
    const key = `${parsed.runId}:${parsed.attempt}`;
    if (!runs.has(key)) runs.set(key, await api(`/actions/runs/${parsed.runId}/attempts/${parsed.attempt}`));
  }
  if (command === "discard-current") {
    const current = artifacts.find((artifact) => artifact.id === currentId);
    if (!current) return;
    if (!isOwnedArtifact(current, runs.get(`${runId}:${attempt}`)) ||
        current.name !== `cloud-backup-v1-${runId}-${attempt}`) {
      throw new Error("Refusing to discard anything except this run's own failed replacement.");
    }
    await api(`/actions/artifacts/${currentId}`, "DELETE");
    console.log("Discarded this run's unverified replacement only; prior backups were not touched.");
    return;
  }
  const plan = planRetention(artifacts, runs, currentId, runId, attempt,
    process.env.BACKUP_RESTORE_VERIFIED === "true");
  for (const id of plan.deleteIds) await api(`/actions/artifacts/${id}`, "DELETE");
  console.log(`Restore verified; retained ${plan.keepIds.length} snapshots and pruned ${plan.deleteIds.length} older workflow-owned artifacts.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never log provider responses, database URLs, paths or secret-bearing error objects.
    console.error("Cloud backup artifact operation failed. Existing good backups were not proactively removed. Check the workflow gate and bounded inventory.");
    process.exitCode = 1;
  });
}

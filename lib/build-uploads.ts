"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { readPilotLimits } from "./pilot";
import {
  deleteQuarantine,
  deleteStored,
  promoteQuarantine,
  readQuarantine,
  storageKey,
  sweepStaleQuarantine,
  writeQuarantine,
} from "./storage";
import { scanUpload } from "./scan";
import {
  getUploadPermission,
  markReservationStored,
  releaseReservation,
  reserveStorage,
} from "./storage-usage";
import { betaMods, builds } from "../db/schema";
import {
  BuildUploadFormSchema,
  MAX_UPLOAD_BYTES,
  type BuildUploadFormState,
} from "./definitions";

/**
 * Upload pipeline — always quarantine -> scan -> serve. Never store or serve
 * anything that hasn't come back clean from the malware scanner, and if no
 * scanner is configured, refuse the upload outright.
 *
 * In production the final destination is a private R2 bucket, so the sequence
 * is: local quarantine -> ClamAV -> R2 -> drop the local copy. The PC keeps
 * nothing durable.
 *
 * Capacity is claimed BEFORE any bytes are stored, from a database ledger
 * (see lib/storage-usage.ts). That ordering is deliberate: a cap checked after
 * the upload would already have spent the storage it was meant to prevent.
 * Every exit path from here either settles the reservation against the new
 * build row or releases it, so a failed or blocked upload costs no capacity.
 */
export async function uploadBuild(
  state: BuildUploadFormState,
  formData: FormData,
): Promise<BuildUploadFormState> {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) return { message: "Missing mod id." };

  // Gate: must be signed in. (Ownership is checked right before the write.)
  const session = await verifySession();
  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const validatedFields = BuildUploadFormSchema.safeParse({
    versionLabel: formData.get("versionLabel"),
    changelog: formData.get("changelog"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      message: `File is too large — max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    };
  }

  // Owner check — the mutating steps below must not run for non-owners.
  const modRows = await db
    .select({ ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, betaModId))
    .limit(1);
  const mod = modRows[0];
  if (!mod || mod.ownerId !== session.userId) {
    redirect(`/mods/${betaModId}`);
  }

  const limits = readPilotLimits();

  // Kill switch and pilot allowlist, in that order. The page also checks these
  // to decide whether to render the form, but this is the check that counts.
  const permission = await getUploadPermission(session.userId, limits);
  if (!permission.allowed) {
    return { message: permission.message };
  }

  // Claim the bytes. This enforces the rate limit, the per-file ceiling, the
  // per-tester cap and the global cap, atomically, and refuses outright if the
  // ledger cannot be read.
  const reservation = await reserveStorage({
    userId: session.userId,
    bytes: file.size,
    limits,
  });
  if (!reservation.ok) {
    return { message: reservation.message };
  }

  // From here on there is a reservation to unwind on every failure path.
  const reservationId = reservation.reservationId;
  // Best-effort: reap any quarantined bytes abandoned by an earlier crash.
  // The volume is scratch space; it should not accumulate.
  sweepStaleQuarantine();

  // 1. Quarantine — the raw upload lands in an isolated temp location.
  const quarantineKey = writeQuarantine(new Uint8Array(await file.arrayBuffer()));
  const buildId = randomUUID();
  const finalKey = storageKey(`builds/${buildId}`, file.name);
  let promoted = false;

  try {
    // 2. Scan — the quarantined bytes against the malware scanner.
    const quarantineData = readQuarantine(quarantineKey);
    if (!quarantineData) throw new Error("quarantine write failed");

    const scan = await scanUpload(quarantineData);
    if (!scan.ok) {
      deleteQuarantine(quarantineKey);
      await releaseReservation(reservationId);
      if (scan.reason === "not-configured") {
        return {
          message:
            "Malware scanner isn't configured — uploads are disabled until SCAN_ENDPOINT is set.",
        };
      }
      if (scan.reason === "infected") {
        return {
          message: `Upload blocked — the scanner flagged this file${
            scan.malware ? ` (${scan.malware})` : ""
          }.`,
        };
      }
      return {
        message: `Upload failed — scanner unavailable (${scan.message}). Try again.`,
      };
    }

    // 3. Promote — only clean files reach final storage (R2 in production).
    await promoteQuarantine(quarantineKey, finalKey);
    promoted = true;

    // 4. Record the build, then settle the reservation against it. If either
    //    step fails the catch below releases the bytes and removes the object.
    const { versionLabel, changelog } = validatedFields.data;
    await db.insert(builds).values({
      id: buildId,
      betaModId,
      versionLabel,
      fileUrl: finalKey,
      changelog: changelog || null,
    });
    await markReservationStored(reservationId, buildId);
  } catch {
    deleteQuarantine(quarantineKey);
    await releaseReservation(reservationId);
    if (promoted) {
      // The bytes made it to final storage but the build row did not, so the
      // object is unreachable and would never be reclaimed by a later delete.
      await deleteStored(finalKey).catch(() => {});
    }
    return { message: "Upload failed — please try again." };
  }

  redirect(`/mods/${betaModId}`);
}

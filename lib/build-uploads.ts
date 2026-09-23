"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import {
  deleteQuarantine,
  promoteQuarantine,
  readQuarantine,
  storageKey,
  writeQuarantine,
} from "./storage";
import { scanUpload } from "./scan";
import { betaMods, builds } from "../db/schema";
import {
  BuildUploadFormSchema,
  MAX_UPLOAD_BYTES,
  type BuildUploadFormState,
} from "./definitions";

/**
 * Upload pipeline — always quarantine → scan → serve. Never store or serve
 * anything that hasn't come back clean from the malware scanner, and if no
 * scanner is configured, refuse the upload outright.
 */
export async function uploadBuild(
  state: BuildUploadFormState,
  formData: FormData,
): Promise<BuildUploadFormState> {
  const betaModId = String(formData.get("betaModId") ?? "");
  if (!betaModId) return { message: "Missing mod id." };

  // Gate: must be signed in. (Ownership is checked right before the write.)
  await verifySession();
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
  const session = await verifySession();
  const modRows = await db
    .select({ ownerId: betaMods.ownerId })
    .from(betaMods)
    .where(eq(betaMods.id, betaModId))
    .limit(1);
  const mod = modRows[0];
  if (!mod || mod.ownerId !== session.userId) {
    redirect(`/mods/${betaModId}`);
  }

  // 1. Quarantine — the raw upload lands in an isolated temp location.
  const quarantineKey = writeQuarantine(new Uint8Array(await file.arrayBuffer()));

  try {
    // 2. Scan — the quarantined bytes against the malware scanner.
    const quarantineData = readQuarantine(quarantineKey);
    if (!quarantineData) throw new Error("quarantine write failed");

    const scan = await scanUpload(quarantineData);
    if (!scan.ok) {
      deleteQuarantine(quarantineKey);
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

    // 3. Promote — only clean files reach final storage.
    const buildId = randomUUID();
    const finalKey = storageKey(`builds/${buildId}`, file.name);
    await promoteQuarantine(quarantineKey, finalKey);

    const { versionLabel, changelog } = validatedFields.data;
    await db.insert(builds).values({
      id: buildId,
      betaModId,
      versionLabel,
      fileUrl: finalKey,
      changelog: changelog || null,
    });
  } catch {
    deleteQuarantine(quarantineKey);
    return { message: "Upload failed — please try again." };
  }

  redirect(`/mods/${betaModId}`);
}
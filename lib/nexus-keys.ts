import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "./db";
import { nexusLinks } from "../db/schema";

/**
 * Encrypted at-rest storage for each user's Nexus credential (the per-user
 * API key / access token that backs any file-push step — never a shared
 * app-wide key). Backs the `nexus_links` table.
 *
 * AES-256-GCM with a key derived from the base64 `ENCRYPTION_KEY` env var
 * (32 random bytes). The module refuses to run without that var rather than
 * silently falling back to a weak dev key.
 *
 * Phase 3 scaffold. In production the SSO flow (lib/nexus-sso.ts) populates
 * this; nothing here has been validated against a live Nexus API yet.
 */

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set — required for encrypted Nexus credential storage.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be the base64 encoding of exactly 32 random bytes.",
    );
  }
  return key;
}

const AAD = Buffer.from("nexus-credential:v1");

/** Returns `v1.<iv b64>.<auth tag b64>.<ciphertext b64>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unrecognized encrypted payload format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Upsert a user's Nexus credential, encrypted. One row per user. */
export async function setUserNexusCredential(
  userId: string,
  credential: string,
): Promise<void> {
  if (!db) throw new Error("Database isn't configured.");
  await db
    .insert(nexusLinks)
    .values({ userId, nexusApiKeyEncrypted: encryptSecret(credential) })
    .onConflictDoUpdate({
      target: nexusLinks.userId,
      set: {
        nexusApiKeyEncrypted: encryptSecret(credential),
        linkedAt: new Date(),
      },
    });
}

export async function deleteUserNexusCredential(userId: string): Promise<void> {
  if (!db) return;
  await db.delete(nexusLinks).where(eq(nexusLinks.userId, userId));
}

/** Decrypted credential, or null when the user has never linked Nexus. */
export async function getUserNexusCredential(
  userId: string,
): Promise<string | null> {
  if (!db) return null;

  const rows = await db
    .select({ nexusApiKeyEncrypted: nexusLinks.nexusApiKeyEncrypted })
    .from(nexusLinks)
    .where(eq(nexusLinks.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  try {
    return decryptSecret(row.nexusApiKeyEncrypted);
  } catch {
    // A corrupt/unreadable row shouldn't take the account down.
    return null;
  }
}

export async function hasUserNexusCredential(userId: string): Promise<boolean> {
  return (await getUserNexusCredential(userId)) !== null;
}
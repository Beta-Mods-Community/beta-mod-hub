import "server-only";

import { randomUUID } from "node:crypto";
import { decodeMediaImage } from "./image-decode";
import { MAX_MEDIA_BYTES } from "./image-meta";
import { cloudPilotEnabled, CLOUD_UPLOAD_BYTES } from "./cloud-pilot";
import { MediaError } from "./media-policy";
import { scanUpload, type ScanResult } from "./scan";
import { deleteQuarantine, deleteStored, promoteQuarantine, sweepStaleQuarantine, writeQuarantine } from "./storage";

type ProcessedImage = Awaited<ReturnType<typeof decodeMediaImage>>;
export type MediaPipelineDependencies = {
  scan: (data: Uint8Array) => Promise<ScanResult>;
  decode: (data: Uint8Array) => Promise<ProcessedImage>;
  quarantine: (data: Uint8Array) => string;
  removeQuarantine: (key: string) => void;
  store: (key: string, finalKey: string, options: { contentType: string }) => Promise<void>;
  removeStored: (key: string) => Promise<void>;
  sweep: () => number;
};

const dependencies: MediaPipelineDependencies = {
  scan: scanUpload, decode: decodeMediaImage, quarantine: writeQuarantine,
  removeQuarantine: deleteQuarantine, store: promoteQuarantine,
  removeStored: deleteStored, sweep: sweepStaleQuarantine,
};

function assertClean(scan: ScanResult) {
  if (scan.ok) return;
  if (scan.reason === "infected") throw new MediaError("Upload blocked: the malware scanner flagged this image.");
  throw new MediaError("The malware scanner is unavailable. Please retry your upload later.");
}

/** Both original bytes and the canonical image are scanned. Publishing receives
 * only clean final bytes. A failed storage cleanup must retain the quota charge.
 */
export async function processMediaUpload(input: {
  modId: string;
  file: File;
  resizeReservation: (bytes: number) => Promise<void>;
  publish: (image: { id: string; objectKey: string; sizeBytes: number; width: number; height: number; mimeType: string }) => Promise<void>;
  isPublished: (id: string) => Promise<boolean>;
  releaseReservation: () => Promise<void>;
  retainReservation: () => Promise<void>;
}, deps: MediaPipelineDependencies = dependencies): Promise<string> {
  let originalKey: string | undefined;
  let imageKey: string | undefined;
  let attemptedStore = false;
  let storageCompleted = false;
  let published = false;
  let publishing = false;
  let commitUnknown = false;
  const id = randomUUID();
  const finalKey = `media/${input.modId}/${id}.webp`;
  try {
    const maxBytes = cloudPilotEnabled() ? CLOUD_UPLOAD_BYTES : MAX_MEDIA_BYTES;
    if (!input.file.size || input.file.size > maxBytes) throw new MediaError(`Choose an image no larger than ${maxBytes / 1024 / 1024} MiB.`);
    deps.sweep();
    const original = new Uint8Array(await input.file.arrayBuffer());
    originalKey = deps.quarantine(original);
    assertClean(await deps.scan(original));
    const image = await deps.decode(original);
    if (image.data.byteLength > maxBytes) throw new MediaError("The processed image exceeds this site's upload limit.");
    await input.resizeReservation(image.data.byteLength);
    imageKey = deps.quarantine(image.data);
    assertClean(await deps.scan(image.data));
    attemptedStore = true;
    await deps.store(imageKey, finalKey, { contentType: image.mime });
    storageCompleted = true;
    publishing = true;
    await input.publish({ id, objectKey: finalKey, sizeBytes: image.data.byteLength, width: image.width, height: image.height, mimeType: image.mime });
    published = true;
    return id;
  } finally {
    if (originalKey) { try { deps.removeQuarantine(originalKey); } catch {} }
    if (imageKey) { try { deps.removeQuarantine(imageKey); } catch {} }
    if (!published && publishing) {
      // A lost COMMIT acknowledgement is not proof of rollback. Never remove
      // an object that may already be referenced by a committed gallery row.
      try { published = await input.isPublished(id); }
      catch { commitUnknown = true; }
    }
    if (!published) {
      if (commitUnknown) {
        console.error("[media] Publish outcome unknown; preserving object and quota", finalKey);
        await input.retainReservation();
      } else {
        let removed = !attemptedStore;
        if (attemptedStore) {
          try { await deps.removeStored(finalKey); removed = true; }
          catch { console.error("[media] Stored-object cleanup failed; quota retained", finalKey); }
        }
        // A timed-out PUT may finish remotely after a successful DELETE.
        // Unacknowledged storage remains charged until reconciled.
        if (removed && (!attemptedStore || storageCompleted)) await input.releaseReservation();
        else await input.retainReservation();
      }
    }
  }
}

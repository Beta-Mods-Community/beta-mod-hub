import "server-only";

import sharp from "sharp";
import { MAX_MEDIA_BYTES, MAX_MEDIA_DIMENSION, MIN_MEDIA_DIMENSION } from "./image-meta";
import { MediaError } from "./media-policy";
import { cloudPilotEnabled, CLOUD_UPLOAD_BYTES, CLOUD_IMAGE_PIXELS } from "./cloud-pilot";

/** Decode every pixel, reject animation, strip metadata and store a canonical WebP.
 * A plausible image header is not proof that its pixel stream is valid.
 */
export async function decodeMediaImage(data: Uint8Array) {
  const cloud = cloudPilotEnabled();
  const maxBytes = cloud ? CLOUD_UPLOAD_BYTES : MAX_MEDIA_BYTES;
  if (!data.byteLength || data.byteLength > maxBytes) {
    throw new MediaError(`Choose an image no larger than ${maxBytes / 1024 / 1024} MiB.`);
  }
  try {
    const image = sharp(data, {
      failOn: "warning",
      limitInputPixels: cloud ? CLOUD_IMAGE_PIXELS : MAX_MEDIA_DIMENSION * MAX_MEDIA_DIMENSION,
      animated: true,
    });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
      throw new Error("unsupported");
    }
    if ((metadata.pages ?? 1) !== 1) throw new Error("animation");
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < MIN_MEDIA_DIMENSION || height < MIN_MEDIA_DIMENSION ||
        width > MAX_MEDIA_DIMENSION || height > MAX_MEDIA_DIMENSION) throw new Error("dimensions");
    // toBuffer forces complete decode. Re-encoding strips scripts, trailing
    // payloads, GPS/EXIF metadata and container features not used by a gallery.
    const encoded = await image.rotate().webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
    if (encoded.data.byteLength > maxBytes) throw new Error("size");
    return { data: encoded.data, width: encoded.info.width, height: encoded.info.height, mime: "image/webp" as const };
  } catch {
    throw new MediaError(`Use a valid, still PNG, JPEG or WebP image between 160 and 4096 pixels on each side, up to ${maxBytes / 1024 / 1024} MiB${cloud ? " and 4 megapixels" : ""}.`);
  }
}

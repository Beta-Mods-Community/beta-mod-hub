import { z } from "zod";

export const MAX_MOD_IMAGES = 24;
export class MediaError extends Error {}
export const MediaCaptionSchema = z.string().trim().max(200, "Keep captions under 200 characters.");
export const MediaIdSchema = z.string().uuid();

export type GalleryImage = {
  id: string;
  width: number;
  height: number;
  caption: string | null;
  isHero: boolean;
  position: number;
};

export function galleryOrder<T extends GalleryImage>(images: T[]): T[] {
  return [...images].sort((a, b) => Number(b.isHero) - Number(a.isHero) || a.position - b.position);
}

export function assertMediaOwner(mod: { ownerId: string; status: string; hiddenAt?: Date | null } | undefined, userId: string) {
  if (!mod || mod.ownerId !== userId) throw new MediaError("Only the mod owner can manage screenshots.");
  if (mod.hiddenAt || mod.status === "promoted" || mod.status === "abandoned") {
    throw new MediaError("Screenshots cannot be changed on a closed or hidden mod.");
  }
}

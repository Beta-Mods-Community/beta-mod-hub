"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "./dal";
import { getAccountWriteError } from "./access";
import { MediaCaptionSchema, MediaError, MediaIdSchema } from "./media-policy";
import { changeModMediaForUser, uploadModMediaForUser, type MediaChange } from "./media-service";

export type MediaFormState = { ok?: boolean; message?: string };

function refreshMedia(modId: string) {
  revalidatePath(`/mods/${modId}`);
  revalidatePath("/browse");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function uploadModMedia(_state: MediaFormState | undefined, formData: FormData): Promise<MediaFormState> {
  const session = await verifySession();
  const accountError = await getAccountWriteError(session.userId);
  if (accountError) return { message: accountError };
  const id = MediaIdSchema.safeParse(formData.get("betaModId"));
  const caption = MediaCaptionSchema.safeParse(formData.get("caption") ?? "");
  const file = formData.get("file");
  if (!id.success || !caption.success || !(file instanceof File)) return { message: "Choose an image and a caption of up to 200 characters." };
  try {
    await uploadModMediaForUser({ userId: session.userId, modId: id.data, file, caption: caption.data });
    refreshMedia(id.data);
    return { ok: true, message: "Screenshot uploaded and scanned." };
  } catch (error) {
    return { message: error instanceof MediaError ? error.message : "The screenshot could not be saved. Please retry." };
  }
}

export async function manageModMedia(_state: MediaFormState | undefined, formData: FormData): Promise<MediaFormState> {
  const session = await verifySession();
  const accountError = await getAccountWriteError(session.userId);
  if (accountError) return { message: accountError };
  const modId = MediaIdSchema.safeParse(formData.get("betaModId"));
  const mediaId = MediaIdSchema.safeParse(formData.get("mediaId"));
  if (!modId.success || !mediaId.success) return { message: "This screenshot is no longer available." };
  const operation = formData.get("operation");
  let change: MediaChange;
  if (operation === "caption") {
    const caption = MediaCaptionSchema.safeParse(formData.get("caption") ?? "");
    if (!caption.success) return { message: "Keep captions under 200 characters." };
    change = { kind: "caption", caption: caption.data };
  } else if (operation === "hero" || operation === "delete") change = { kind: operation };
  else if (operation === "up" || operation === "down") change = { kind: "move", direction: operation };
  else return { message: "Unknown screenshot action." };
  try {
    await changeModMediaForUser({ userId: session.userId, modId: modId.data, mediaId: mediaId.data, change });
    refreshMedia(modId.data);
    return { ok: true, message: operation === "delete" ? "Screenshot removed." : "Screenshot updated." };
  } catch (error) {
    return { message: error instanceof MediaError ? error.message : "The screenshot could not be updated. Please retry." };
  }
}

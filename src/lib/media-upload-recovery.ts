import type { MediaFormState } from "@lib/mod-media";

export const MEDIA_UPLOAD_UNCONFIRMED = "We couldn't confirm this screenshot upload. Refresh the page and check the gallery before submitting it again.";

type MediaUploadAction = (previous: MediaFormState | undefined, data: FormData) => Promise<MediaFormState>;

/** Client recovery only: the original server action still owns every check and
 * the upload. A lost response does not prove the upload failed or is safe to retry.
 */
export async function recoverMediaUpload(action: MediaUploadAction, previous: MediaFormState | undefined, data: FormData, rethrowFrameworkError: (error: unknown) => void): Promise<MediaFormState> {
  try {
    return await action(previous, data);
  } catch (error) {
    // Authentication can redirect. Keep Next's navigation/control flow intact.
    rethrowFrameworkError(error);
    return { message: MEDIA_UPLOAD_UNCONFIRMED };
  }
}

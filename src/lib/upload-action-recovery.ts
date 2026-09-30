export const BUILD_UPLOAD_UNCONFIRMED = "We couldn't confirm this build upload. Check the mod's Files section in a new tab before submitting it again.";
export const BUG_REPORT_UNCONFIRMED = "We couldn't confirm this bug report. Check the mod's bug reports in a new tab before submitting it again.";

/** Keep a lost action response in the form without guessing whether a write
 * succeeded. The caller supplies a fixed safe state, never the caught error.
 * Invoke the original action once, preserving its payload and returned state.
 */
export async function recoverUploadAction<Previous, Result>(
  action: (previous: Previous, data: FormData) => Promise<Result>,
  previous: Previous,
  data: FormData,
  rethrowFrameworkError: (error: unknown) => void,
  unconfirmed: Result,
): Promise<Result> {
  try {
    return await action(previous, data);
  } catch (error) {
    // Redirects/not-found are Next control flow, not failed submissions.
    rethrowFrameworkError(error);
    return unconfirmed;
  }
}

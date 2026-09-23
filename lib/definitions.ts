import * as z from "zod";

/**
 * Form schemas and state shapes for the local email+password auth flow.
 * Replaced/augmented by Nexus SSO in phase 3; these stay for the pre-SSO
 * fallback accounts.
 */

export const SignupFormSchema = z.object({
  displayName: z
    .string()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(40, { error: "Name must be 40 characters or fewer." })
    .trim(),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z
    .string()
    .min(8, { error: "Be at least 8 characters long." })
    .regex(/[a-zA-Z]/, { error: "Contain at least one letter." })
    .regex(/[0-9]/, { error: "Contain at least one number." })
    .regex(/[^a-zA-Z0-9]/, {
      error: "Contain at least one special character.",
    }),
});

export const LoginFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Please enter your password." }),
});

export type FieldErrors<T extends string> = Partial<Record<T, string[]>>;

export type SignupFormState =
  | {
      errors?: FieldErrors<"displayName" | "email" | "password">;
      message?: string;
    }
  | undefined;

export type LoginFormState =
  | {
      errors?: FieldErrors<"email" | "password">;
      message?: string;
    }
  | undefined;

export const BetaModStatusForm = z.enum(["alpha", "beta", "rc", "abandoned"]);

export const BetaModFormSchema = z.object({
  title: z
    .string()
    .min(3, { error: "Title must be at least 3 characters long." })
    .max(80, { error: "Title must be 80 characters or fewer." })
    .trim(),
  game: z
    .string()
    .min(1, { error: "Enter the game this mod is for." })
    .max(60, { error: "Game name must be 60 characters or fewer." })
    .trim(),
  tags: z
    .string()
    .max(200, { error: "Keep tags under 200 characters." })
    .trim(),
  description: z
    .string()
    .max(10000, { error: "Description must be 10,000 characters or fewer." })
    .trim(),
  status: BetaModStatusForm,
});

export type BetaModFormState =
  | {
      errors?: FieldErrors<"title" | "game" | "tags" | "description" | "status">;
      message?: string;
    }
  | undefined;

export const BuildUploadFormSchema = z.object({
  versionLabel: z
    .string()
    .min(1, { error: "Add a version label (e.g. 0.1 or Beta 2)." })
    .max(40, { error: "Version label must be 40 characters or fewer." })
    .trim(),
  changelog: z
    .string()
    .max(5000, { error: "Changelog must be 5,000 characters or fewer." })
    .trim(),
});

export type BuildUploadFormState =
  | {
      errors?: FieldErrors<"versionLabel" | "changelog">;
      message?: string;
    }
  | undefined;

/** Max accepted upload size (512 MB) — shared by the action and the form label. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

export const BugReportFormSchema = z.object({
  severity: z.enum(["minor", "major", "blocking"]),
  description: z
    .string()
    .min(10, { error: "Describe the bug — at least 10 characters." })
    .max(4000, { error: "Description must be 4,000 characters or fewer." })
    .trim(),
  reproSteps: z
    .string()
    .max(2000, { error: "Repro steps must be 2,000 characters or fewer." })
    .trim(),
});

export type BugReportFormState =
  | {
      errors?: FieldErrors<"severity" | "description" | "reproSteps">;
      message?: string;
    }
  | undefined;
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
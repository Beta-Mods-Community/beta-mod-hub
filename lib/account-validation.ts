import * as z from "zod";

export const PasswordSchema = z.string()
  .min(12, "Use at least 12 characters.")
  .refine((value) => new TextEncoder().encode(value).byteLength <= 72, "Use no more than 72 bytes (about 72 English characters).")
  .refine((value) => value.trim().length >= 12, "Use at least 12 non-padding characters.");

export const AccountEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const NewPasswordFormSchema = z.object({
  password: PasswordSchema,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});

export type AccountFormState = {
  message?: string;
  success?: boolean;
  errors?: Partial<Record<"email" | "password" | "confirmPassword" | "currentPassword", string[]>>;
} | undefined;

"use server";

import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { accountTokens, users } from "../db/schema";
import { getSession, deleteSession } from "./session";
import { accountMailConfig, MAIL_UNAVAILABLE } from "./account-mail";
import { issueAccountToken, redeemAccountToken, replaceAccountPassword, takeAuthAttempt } from "./account-security";
import { isAccountToken, tokenDigest } from "./account-policy";
import { AccountEmailSchema, NewPasswordFormSchema, type AccountFormState } from "./account-validation";

const UNAVAILABLE = "Account services are temporarily unavailable. Please try again shortly.";
const INVALID_LINK = "This link is invalid, expired, or has already been used. Request a new link.";

export async function requestPasswordReset(_state: AccountFormState, data: FormData): Promise<AccountFormState> {
  const parsed = AccountEmailSchema.safeParse(data.get("email"));
  if (!parsed.success) return { errors: { email: ["Enter a valid email address."] } };
  if (!accountMailConfig()) return { message: MAIL_UNAVAILABLE };
  if (!db) return { message: UNAVAILABLE };
  try {
    if (!await takeAuthAttempt("recovery", parsed.data)) return { message: "Too many recovery requests. Please try again in an hour." };
    const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, suspendedAt: users.suspendedAt })
      .from(users).where(sql`lower(${users.email}) = ${parsed.data}`).limit(1);
    if (user?.email && user.passwordHash && !user.suspendedAt) {
      try { await issueAccountToken(user.id, user.email, "reset-password"); }
      catch { /* Keep the response identical for registered and unknown emails. */ }
    }
    return { success: true, message: "If that address has a password account, a reset link will be sent. Check your inbox and spam folder. If it does not arrive, try again later or contact the site owner." };
  } catch { return { message: UNAVAILABLE }; }
}

export async function resendVerification(_state: AccountFormState): Promise<AccountFormState> {
  void _state;
  const session = await getSession();
  if (!session) return { message: "Sign in before requesting verification." };
  if (!accountMailConfig()) return { message: MAIL_UNAVAILABLE };
  if (!db) return { message: UNAVAILABLE };
  try {
    if (!await takeAuthAttempt("verification", session.userId)) return { message: "Too many verification requests. Please try again in an hour." };
    const [user] = await db.select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user?.email) return { message: "This account does not have an email address. Contact the site owner." };
    if (user.emailVerifiedAt) return { success: true, message: "Your email is already verified." };
    await issueAccountToken(session.userId, user.email, "verify-email");
    return { success: true, message: accountMailConfig()?.mode === "preview" ? "Verification was saved to the private local mail preview. Ask the site owner to open it on this PC." : "Verification email sent. Check your inbox and spam folder." };
  } catch { return { message: "Verification email could not be sent. Please try again later." }; }
}

export async function verifyEmail(_state: AccountFormState, data: FormData): Promise<AccountFormState> {
  const token = data.get("token");
  if (!isAccountToken(token)) return { message: INVALID_LINK };
  try {
    // Charge the shared token budget only on FAILED redemption, so random-token
    // floods cannot lock out legitimate verifications site-wide. A successful
    // redemption consumes nothing and is single-use via DELETE ... RETURNING.
    if (!await redeemAccountToken(token, "verify-email")) {
      if (!await takeAuthAttempt("tokenVerify", token)) return { message: "Too many attempts. Please try again in 15 minutes." };
      return { message: INVALID_LINK };
    }
    revalidatePath("/account");
    return { success: true, message: "Your email is verified. You can return to your account." };
  } catch { return { message: UNAVAILABLE }; }
}

export async function resetPassword(_state: AccountFormState, data: FormData): Promise<AccountFormState> {
  const token = data.get("token");
  if (!isAccountToken(token)) return { message: INVALID_LINK };
  const parsed = NewPasswordFormSchema.safeParse({ password: data.get("password"), confirmPassword: data.get("confirmPassword") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  try {
    // Cheap existence peek before the bcrypt hash: an unauthenticated request
    // never bills us a cost-12 hash unless a real, live reset token exists.
    // Single use is still enforced by the DELETE ... RETURNING inside
    // redeemAccountToken, which remains the arbiter under concurrency.
    if (!db) return { message: UNAVAILABLE };
    const [candidate] = await db.select({ tokenHash: accountTokens.tokenHash }).from(accountTokens).where(and(
      eq(accountTokens.tokenHash, tokenDigest(token)), eq(accountTokens.purpose, "reset-password"),
      gt(accountTokens.expiresAt, new Date()),
    ));
    if (!candidate) {
      if (!await takeAuthAttempt("tokenReset", token)) return { message: "Too many attempts. Please try again in 15 minutes." };
      return { message: INVALID_LINK };
    }
    const hash = await bcrypt.hash(parsed.data.password, 12);
    if (!await redeemAccountToken(token, "reset-password", hash)) {
      if (!await takeAuthAttempt("tokenReset", token)) return { message: "Too many attempts. Please try again in 15 minutes." };
      return { message: INVALID_LINK };
    }
    await deleteSession();
  } catch { return { message: UNAVAILABLE }; }
  redirect("/login?password=reset");
}

export async function changePassword(_state: AccountFormState, data: FormData): Promise<AccountFormState> {
  const session = await getSession();
  if (!session || !db) return { message: "Sign in to change your password." };
  const parsed = NewPasswordFormSchema.safeParse({ password: data.get("password"), confirmPassword: data.get("confirmPassword") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const currentPassword = data.get("currentPassword");
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 1024) return { errors: { currentPassword: ["Enter your current password."] } };
  try {
    if (!await takeAuthAttempt("password", session.userId)) return { message: "Too many attempts. Please try again in 15 minutes." };
    const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user?.passwordHash) return { message: "Your account uses Nexus sign-in and does not have a local password." };
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) return { errors: { currentPassword: ["The current password is incorrect."] } };
    if (currentPassword === parsed.data.password) return { errors: { password: ["Choose a different password."] } };
    const hash = await bcrypt.hash(parsed.data.password, 12);
    if (!await replaceAccountPassword(session.userId, user.passwordHash, hash)) return { message: "Your account changed during this request. Sign in again and retry." };
    await deleteSession();
  } catch { return { message: UNAVAILABLE }; }
  redirect("/login?password=changed");
}

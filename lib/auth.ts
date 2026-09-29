"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

import { db } from "./db";
import { createSession, deleteSession } from "./session";
import { users } from "../db/schema";
import { issueAccountToken, takeAuthAttempt } from "./account-security";
import { accountMailConfig } from "./account-mail";
import { LoginFormSchema, SignupFormSchema, type LoginFormState, type SignupFormState } from "./definitions";

// Valid bcrypt hash used for missing accounts so they still pay the password
// comparison cost. It is not a usable account credential.
const DUMMY_HASH = "$2b$12$gB7Of3ZWUa.iLK.qNWvvNuCe.kyLW0PmQE2z2XPmxAUevnTWzwKKe";
const UNAVAILABLE = "Sign-in is temporarily unavailable. Please try again shortly.";
const LIMITED = "Too many attempts. Please wait 15 minutes before trying again.";

export async function signup(_state: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const fields = SignupFormSchema.safeParse({ displayName: formData.get("displayName"), email: formData.get("email"), password: formData.get("password") });
  if (!fields.success) return { errors: fields.error.flatten().fieldErrors };
  if (!db) return { message: UNAVAILABLE };
  const { displayName, email, password } = fields.data;
  try {
    if (!await takeAuthAttempt("signup", email)) return { message: "Too many account requests. Please try again in an hour." };
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({ displayName, email, passwordHash })
      .onConflictDoNothing().returning({ id: users.id });
    if (!user) return { message: "Unable to create an account with those details. Try signing in or resetting your password." };
    // Account creation remains possible during local development. Public
    // posting is separately gated on verification, never inferred from email.
    if (accountMailConfig()) {
      try { await issueAccountToken(user.id, email, "verify-email"); } catch { /* Account page offers a retry and reports delivery status honestly. */ }
    }
    await createSession(user.id);
  } catch { return { message: "Account creation is temporarily unavailable. Please try again shortly." }; }
  redirect("/account?created=1");
}

export async function login(_state: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const fields = LoginFormSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!fields.success) return { errors: fields.error.flatten().fieldErrors };
  if (!db) return { message: UNAVAILABLE };
  const { email, password } = fields.data;
  try {
    if (!await takeAuthAttempt("login", email)) return { message: LIMITED };
    const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash, sessionVersion: users.sessionVersion, suspendedAt: users.suspendedAt })
      .from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!matches || !user?.passwordHash || user.suspendedAt) return { message: "Invalid email or password." };
    await createSession(user.id, user.sessionVersion);
  } catch { return { message: UNAVAILABLE }; }
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/");
}

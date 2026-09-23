"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { createSession, deleteSession } from "./session";
import { users } from "../db/schema";
import {
  LoginFormSchema,
  SignupFormSchema,
  type LoginFormState,
  type SignupFormState,
} from "./definitions";

export async function signup(
  state: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const validatedFields = SignupFormSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const { displayName, email, password } = validatedFields.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    return { errors: { email: ["An account with this email already exists."] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const inserted = await db
    .insert(users)
    .values({ displayName, email, passwordHash })
    .returning({ id: users.id });

  const user = inserted[0];
  if (!user) {
    return { message: "Something went wrong creating your account. Try again." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function login(
  state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const { email, password } = validatedFields.data;

  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  // Same message whether the account is missing or the password is wrong,
  // so we never confirm which emails are registered.
  if (!user || !user.passwordHash) {
    return { message: "Invalid email or password." };
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    return { message: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/");
}
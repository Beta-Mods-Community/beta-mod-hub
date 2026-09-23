"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "./db";
import { verifySession } from "./dal";
import { users } from "../db/schema";
import { ProfileFormSchema, type ProfileFormState } from "./definitions";

/**
 * Update the signed-in user's public profile fields. Only the account's
 * own profile can be edited — the session user is the target, and the
 * schema bounds every field (display name, bio, avatar URL).
 */
export async function updateProfile(
  state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const validatedFields = ProfileFormSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    avatarUrl: formData.get("avatarUrl"),
  });

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  const session = await verifySession();
  if (!db) {
    return { message: "The database isn't configured yet — try again shortly." };
  }

  const { displayName, bio, avatarUrl } = validatedFields.data;
  await db
    .update(users)
    .set({ displayName, bio, avatarUrl })
    .where(eq(users.id, session.userId));

  redirect(`/users/${session.userId}`);
}
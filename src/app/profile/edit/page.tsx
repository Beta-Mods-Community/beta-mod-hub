import { notFound } from "next/navigation";

import ProfileForm from "@/components/profile-form";
import { getUser } from "@lib/dal";
import { updateProfile } from "@lib/profiles";

export const metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const user = await getUser();
  if (!user) notFound();

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Edit profile
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Public info other testers and authors see.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <ProfileForm
          action={updateProfile}
          initial={{
            displayName: user.displayName,
            bio: user.bio ?? "",
            avatarUrl: user.avatarUrl ?? "",
          }}
        />
      </div>
    </main>
  );
}
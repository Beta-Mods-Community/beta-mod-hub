import { notFound } from "next/navigation";
import Link from "next/link";

import ProfileForm from "@/components/profile-form";
import { getUser } from "@lib/dal";
import { updateProfile } from "@lib/profiles";

export const metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const user = await getUser();
  if (!user) notFound();

  return (
    <main className="site-container w-full max-w-xl flex-1 py-10 sm:py-12">
      <p className="eyebrow">Account</p>
      <h1 className="page-title mt-3">
        Edit profile
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
        Public info other testers and authors see.
      </p>

      <div className="panel mt-7 p-5 sm:p-7">
        <ProfileForm
          action={updateProfile}
          initial={{
            displayName: user.displayName,
            bio: user.bio ?? "",
            avatarUrl: user.avatarUrl ?? "",
          }}
        />
      </div>
      <Link href="/account" className="mt-5 inline-block text-sm text-[var(--accent)] underline underline-offset-4">Email and password settings</Link>
    </main>
  );
}

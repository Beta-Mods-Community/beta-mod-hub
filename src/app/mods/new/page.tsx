import BetaModForm from "@/components/beta-mod-form";
import { createBetaMod } from "@lib/beta-mods";
import { verifySession } from "@lib/dal";

export const metadata = { title: "Post a beta" };

export default async function NewBetaModPage() {
  // Auth gate — redirects to /login when there's no valid session.
  await verifySession();

  return (
    <main className="site-container w-full max-w-2xl flex-1 py-10 sm:py-14">
      <p className="eyebrow">My mods</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
        Post a beta
      </h1>
      <p className="mb-8 mt-2 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
        Add your mod&apos;s details. You can upload files and add requirements
        after creating the page.
      </p>
      <div className="panel p-5 sm:p-8">
        <BetaModForm action={createBetaMod} submitLabel="Create beta page" />
      </div>
    </main>
  );
}

import BetaModForm from "@/components/beta-mod-form";
import { createBetaMod } from "@lib/beta-mods";
import { verifySession } from "@lib/dal";

export const metadata = { title: "Post a beta" };

export default async function NewBetaModPage() {
  // Auth gate — redirects to /login when there's no valid session.
  await verifySession();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Post a beta
      </h1>
      <p className="mb-8 mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Create the beta page — build uploads and the testing loop come right
        after this.
      </p>
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <BetaModForm action={createBetaMod} submitLabel="Create beta page" />
      </div>
    </main>
  );
}
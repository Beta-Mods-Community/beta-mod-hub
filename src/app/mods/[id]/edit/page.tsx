import { notFound, redirect } from "next/navigation";

import BetaModForm from "@/components/beta-mod-form";
import { updateBetaMod } from "@lib/beta-mods";
import { getBetaMod, verifySession } from "@lib/dal";

export const metadata = { title: "Edit beta" };

export default async function EditBetaModPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await verifySession();

  const mod = await getBetaMod(id);
  if (!mod) notFound();

  // Promoted pages become read-only; owners of promoted mods can't edit here.
  if (mod.status === "promoted") redirect(`/mods/${mod.id}`);
  if (mod.ownerId !== session.userId) redirect(`/mods/${mod.id}`);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Edit beta
      </h1>
      <p className="mb-8 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Update the details of {mod.title}.
      </p>
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <BetaModForm
          action={updateBetaMod}
          submitLabel="Save changes"
          modId={mod.id}
          initial={{
            title: mod.title,
            game: mod.game,
            tags: mod.tags.join(", "),
            description: mod.description ?? "",
            status: mod.status,
          }}
        />
      </div>
    </main>
  );
}
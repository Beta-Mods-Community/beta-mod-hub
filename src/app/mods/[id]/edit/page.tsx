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
    <main className="site-container w-full max-w-2xl flex-1 py-10 sm:py-14">
      <p className="eyebrow">Author workspace</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">
        Edit beta
      </h1>
      <p className="mb-8 mt-2 text-sm text-[var(--text-soft)]">
        Update the details of {mod.title}.
      </p>
      <div className="panel p-5 sm:p-8">
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

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { verifySession } from "@lib/dal";
import { db } from "@lib/db";
import { betaMods } from "../../../db/schema";
import { modFollows } from "../../../db/community-schema";
import { setFollow } from "@lib/community";
import StatusBadge from "@/components/status-badge";
export const metadata = { title: "Following" };
export default async function FollowingPage() {
  const { userId } = await verifySession();
  const rows = db ? await db.select({ mod: betaMods }).from(modFollows).innerJoin(betaMods, eq(betaMods.id, modFollows.betaModId))
    .where(eq(modFollows.userId, userId)).orderBy(desc(modFollows.createdAt)).limit(500) : [];
  // Hidden listings are omitted even for followers; author/admin can use their management views.
  const visible = rows.filter(({ mod }) => !mod.hiddenAt);
  return <main className="site-container flex-1 py-10"><h1 className="text-3xl font-semibold">Following</h1>
    <p className="mt-3 text-sm text-[var(--muted)]">New builds appear in your notifications.</p>
    <ul className="panel mt-6 divide-y divide-[var(--line)]">{visible.map(({ mod }) => <li key={mod.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><Link href={`/mods/${mod.id}`} className="font-semibold hover:text-[var(--accent)]">{mod.title}</Link><p className="my-2 text-sm text-[var(--muted)]">{mod.game}</p><StatusBadge status={mod.status}/></div>
      <form action={setFollow.bind(null, mod.id, false)}><button className="button-secondary">Unfollow</button></form>
    </li>)}</ul>
    {!visible.length && <p className="mt-8">You are not following any available mods. <Link className="text-[var(--accent)] underline" href="/browse">Browse mods</Link></p>}
  </main>;
}

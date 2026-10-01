import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import EmptyStateArt from "@/components/empty-state-art";

import { verifySession } from "@lib/dal";
import { db } from "@lib/db";
import { betaMods } from "../../../db/schema";
import { modFollows } from "../../../db/community-schema";
import { setFollow } from "@lib/community";
import StatusBadge from "@/components/status-badge";

export const metadata = { title: "Following" };

export default async function FollowingPage() {
  const { userId } = await verifySession();
  const rows = db
    ? await db.select({ mod: betaMods }).from(modFollows)
      .innerJoin(betaMods, eq(betaMods.id, modFollows.betaModId))
      .where(eq(modFollows.userId, userId))
      .orderBy(desc(modFollows.createdAt)).limit(500)
    : [];
  // Hidden listings are omitted even for followers; author/admin can use their management views.
  const visible = rows.filter(({ mod }) => !mod.hiddenAt);

  return (
    <main className="site-container flex-1 py-10 sm:py-12">
      <header>
        <h1 className="page-title">Following</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Keep track of mods you want to test. New builds appear in your notifications.
        </p>
      </header>

      {visible.length > 0 ? (
        <ul className="panel mt-7 divide-y divide-line">
          {visible.map(({ mod }) => (
            <li key={mod.id} className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={mod.status} />
                  <span className="text-xs text-muted">{mod.game}</span>
                </div>
                <Link href={`/mods/${mod.id}`} className="mt-3 block break-words text-lg font-semibold leading-snug text-text hover:text-accent">
                  {mod.title}
                </Link>
              </div>
              <form action={setFollow.bind(null, mod.id, false)}>
                <button type="submit" className="button-secondary" aria-label={`Unfollow ${mod.title}`}>
                  Unfollow
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mt-7 border-t border-line py-10" aria-labelledby="following-empty-heading">
          <EmptyStateArt kind="following" />
          <div>
            <h2 id="following-empty-heading" className="section-title font-semibold text-text">No followed mods to show</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
              Browse active betas and choose Follow on a mod page to keep it here and receive updates when a new build is posted.
            </p>
            <Link href="/browse" className="button-secondary mt-4">
              Browse beta mods
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

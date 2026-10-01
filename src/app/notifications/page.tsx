import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import EmptyStateArt from "@/components/empty-state-art";

import { verifySession } from "@lib/dal";
import { getNotifications } from "@lib/notifications";
import { markNotificationsRead } from "@lib/community";
import { formatDate } from "@lib/format";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { userId } = await verifySession();
  const rows = await getNotifications(userId);

  return (
    <main className="site-container flex-1 py-10 sm:py-12">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="page-title">Notifications</h1>
          {rows.some((row) => !row.read) && (
            <form action={markNotificationsRead}>
              <button type="submit" className="button-secondary">Mark all read</button>
            </form>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Updates from followed mods and your bug reports.
          {rows.length >= 100 && " Showing the latest 100."}
        </p>
      </header>

      {rows.length > 0 ? (
        <ul className="panel mt-7 divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className={`p-5 sm:p-6 ${!row.read ? "bg-accent-soft" : ""}`}>
              <Link className="break-words font-medium leading-7 text-text hover:text-accent" href={row.href}>
                {!row.read && <span className="mr-2 rounded-sm bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">New</span>}
                {row.title}
              </Link>
              <p className="mt-2 text-xs text-muted">{formatDate(row.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mt-7 border-t border-line py-10" aria-labelledby="notifications-empty-heading">
          <EmptyStateArt kind="notifications" />
          <div>
            <h2 id="notifications-empty-heading" className="section-title font-semibold text-text">No notifications yet</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
              Follow a beta mod to hear about new builds. Updates to your bug reports will also appear here.
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

import Link from "next/link";
import { verifySession } from "@lib/dal";
import { getNotifications } from "@lib/notifications";
import { markNotificationsRead } from "@lib/community";
import { formatDate } from "@lib/format";
export const metadata = { title: "Notifications" };
export default async function NotificationsPage() {
  const { userId } = await verifySession();
  const rows = await getNotifications(userId);
  return <main className="site-container flex-1 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold">Notifications</h1>
      {rows.some(row => !row.read) && <form action={markNotificationsRead}><button className="button-secondary">Mark all read</button></form>}
    </div>
    <p className="mt-3 text-sm text-[var(--muted)]">Updates from followed mods and your bug reports. Showing the latest 100.</p>
    <ul className="panel mt-6 divide-y divide-[var(--line)]">{rows.map(row => <li key={row.id} className="p-5">
      <Link className="font-medium hover:text-[var(--accent)]" href={row.href}>{!row.read && <span className="mr-2 text-xs text-[var(--accent)]">New</span>}{row.title}</Link>
      <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(row.createdAt)}</p>
    </li>)}</ul>
    {!rows.length && <p className="mt-8 text-[var(--muted)]">No notifications yet. Follow a mod to receive new-build updates here.</p>}
  </main>;
}

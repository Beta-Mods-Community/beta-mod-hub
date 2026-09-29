import Link from "next/link";

import HeaderNav from "@/components/header-nav";
import { logout } from "@lib/auth";
import { getViewer } from "@lib/access";
import { getSession } from "@lib/session";
import { unreadCount } from "@lib/notifications";

export default async function Header() {
  const session = await getSession();
  const viewer = session ? await getViewer() : null;
  const unread = session ? await unreadCount(session.userId) : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="site-container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="Beta Mods home"
          className="group flex min-w-0 items-center gap-2.5 rounded-md"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-base font-black text-[var(--accent-strong)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-contrast)]"
          >
            β
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-[var(--text)]">
              Beta Mods
            </span>
            <span className="hidden font-mono text-[0.6rem] font-medium uppercase tracking-[0.16em] text-[var(--muted)] sm:block">
              Mods in testing
            </span>
          </span>
        </Link>
        <HeaderNav
          userId={session?.userId ?? null}
          isAdmin={viewer?.isAdmin ?? false}
          unread={unread}
          logoutAction={logout}
        />
      </div>
    </header>
  );
}

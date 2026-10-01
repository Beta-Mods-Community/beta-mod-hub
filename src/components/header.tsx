import Link from "next/link";

import HeaderNav from "@/components/header-nav";
import BrandMark from "@/components/brand-mark";
import { logout } from "@lib/auth";
import { getViewer } from "@lib/access";
import { getSession } from "@lib/session";
import { unreadCount } from "@lib/notifications";

export default async function Header() {
  const session = await getSession();
  const viewer = session ? await getViewer() : null;
  const unread = session ? await unreadCount(session.userId) : 0;

  return (
    <header className="sticky top-0 z-50 bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="site-container flex h-16 items-center justify-between gap-2 sm:gap-4">
        <Link
          href="/"
          aria-label="Beta Mods home"
          className="group flex min-w-0 items-center gap-2.5 rounded-md"
        >
          <BrandMark />
          <span className="truncate text-sm font-bold tracking-tight text-[var(--text)] sm:text-base">
            Beta Mods
          </span>
        </Link>
        <HeaderNav
          userId={session?.userId ?? null}
          isAdmin={viewer?.isAdmin ?? false}
          unread={unread}
          logoutAction={logout}
        />
      </div>
      <div className="site-container section-divider" aria-hidden="true" />
    </header>
  );
}

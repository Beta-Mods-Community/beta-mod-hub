"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  Bookmark,
  LogIn,
  LogOut,
  Menu,
  Search,
  Shield,
  Settings,
  Upload,
  UserRound,
  X,
} from "lucide-react";

type HeaderNavProps = {
  userId: string | null;
  isAdmin: boolean;
  unread: number;
  logoutAction: () => Promise<void>;
};

const primaryLinks = [
  { href: "/browse", label: "Browse", icon: Search },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function desktopLinkClass(active: boolean) {
  return [
    "relative inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--text)]",
  ].join(" ");
}

function mobileLinkClass(active: boolean) {
  return [
    "flex min-h-12 items-center gap-3 rounded-md border px-3.5 text-sm font-medium transition-colors",
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "border-transparent text-[var(--text-soft)] hover:border-[var(--line)] hover:bg-white/[0.03] hover:text-[var(--text)]",
  ].join(" ");
}

export default function HeaderNav({
  userId,
  isAdmin,
  unread,
  logoutAction,
}: HeaderNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const profileHref = userId ? `/users/${userId}` : null;

  return (
    <div className="flex items-center">
      <nav
        aria-label="Primary navigation"
        className="hidden items-center gap-1 xl:flex"
      >
        {primaryLinks.map((link) => {
          const active = isCurrent(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={desktopLinkClass(active)}
            >
              {link.label}
            </Link>
          );
        })}

        <span aria-hidden className="mx-2 h-5 w-px bg-[var(--line)]" />

        {userId ? (
          <>
            <Link href="/following" className={desktopLinkClass(isCurrent(pathname, "/following"))}>Following</Link>
            <Link href="/notifications" className={desktopLinkClass(isCurrent(pathname, "/notifications"))} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="h-4 w-4" aria-hidden/>{unread > 0 && <span className="ml-1 text-xs text-[var(--accent)]">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                aria-current={isCurrent(pathname, "/admin") ? "page" : undefined}
                className={desktopLinkClass(isCurrent(pathname, "/admin"))}
              >
                Admin
              </Link>
            )}
            {profileHref && (
              <Link
                href={profileHref}
                aria-current={pathname === profileHref ? "page" : undefined}
                className={desktopLinkClass(pathname === profileHref)}
              >
                Profile
              </Link>
            )}
            <Link href="/account" className={desktopLinkClass(isCurrent(pathname, "/account"))} aria-label="Account settings"><Settings aria-hidden className="h-4 w-4" /></Link>
            <Link href="/mods/new" className="button-primary ml-2 !min-h-10 !px-3.5">
              <Upload aria-hidden className="h-4 w-4" />
              Post a beta
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="ml-1 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                <span className="sr-only xl:not-sr-only">Sign out</span>
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="button-secondary ml-2 !min-h-10 !px-3.5">
            <LogIn aria-hidden className="h-4 w-4" />
            Sign in
          </Link>
        )}
      </nav>

      <button
        ref={menuButtonRef}
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-controls="mobile-navigation"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--text-soft)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)] xl:hidden"
      >
        {open ? (
          <X aria-hidden className="h-5 w-5" />
        ) : (
          <Menu aria-hidden className="h-5 w-5" />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-16 z-30 cursor-default bg-black/45 backdrop-blur-[2px] xl:hidden"
          />
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                menuButtonRef.current?.focus();
              }
            }}
            className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-[var(--line)] bg-[var(--background)] p-3 shadow-2xl xl:hidden"
          >
            <div className="mx-auto flex max-w-2xl flex-col gap-1">
              {primaryLinks.map((link) => {
                const active = isCurrent(pathname, link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={mobileLinkClass(active)}
                  >
                    <Icon aria-hidden className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}

              {userId ? (
                <>
                  <Link href="/following" onClick={() => setOpen(false)} className={mobileLinkClass(isCurrent(pathname, "/following"))}><Bookmark className="h-4 w-4" aria-hidden/>Following</Link>
                  <Link href="/notifications" onClick={() => setOpen(false)} className={mobileLinkClass(isCurrent(pathname, "/notifications"))}><Bell className="h-4 w-4" aria-hidden/>Notifications{unread > 0 ? ` (${unread})` : ""}</Link>
                  <Link href="/account" onClick={() => setOpen(false)} className={mobileLinkClass(isCurrent(pathname, "/account"))}><Settings className="h-4 w-4" aria-hidden/>Account settings</Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      aria-current={isCurrent(pathname, "/admin") ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={mobileLinkClass(isCurrent(pathname, "/admin"))}
                    >
                      <Shield aria-hidden className="h-4 w-4" />
                      Admin
                    </Link>
                  )}
                  {profileHref && (
                    <Link
                      href={profileHref}
                      aria-current={pathname === profileHref ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={mobileLinkClass(pathname === profileHref)}
                    >
                      <UserRound aria-hidden className="h-4 w-4" />
                      Profile
                    </Link>
                  )}
                  <Link
                    href="/mods/new"
                    onClick={() => setOpen(false)}
                    className="button-primary mt-2 w-full"
                  >
                    <Upload aria-hidden className="h-4 w-4" />
                    Post a beta
                  </Link>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="button-secondary mt-1 w-full"
                    >
                      <LogOut aria-hidden className="h-4 w-4" />
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="button-primary mt-2 w-full"
                >
                  <LogIn aria-hidden className="h-4 w-4" />
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

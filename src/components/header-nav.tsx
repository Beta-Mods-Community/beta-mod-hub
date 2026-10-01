"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Bookmark,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
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
  { href: "/dashboard", label: "My mods", icon: LayoutDashboard },
] as const;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function desktopLinkClass(active: boolean) {
  return [
    "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
  ].join(" ");
}

function menuLinkClass(active: boolean) {
  return [
    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
      : "text-[var(--text-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
  ].join(" ");
}

export default function HeaderNav({
  userId,
  isAdmin,
  unread,
  logoutAction,
}: HeaderNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState<"account" | "mobile" | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const profileHref = userId ? `/users/${userId}` : null;
  const accountLinks = [
    ...(profileHref ? [{ href: profileHref, label: "Profile", icon: UserRound }] : []),
    { href: "/account", label: "Account settings", icon: Settings },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];
  const navigationLinks = [
    ...primaryLinks,
    ...(userId ? [{ href: "/following", label: "Following", icon: Bookmark }] : []),
    { href: "/help", label: "Help", icon: BookOpen },
  ];
  const notificationLabel = `Notifications${unread > 0 ? `, ${unread} unread` : ""}`;
  const accountActive = accountLinks.some((link) => isCurrent(pathname, link.href));

  useEffect(() => {
    if (!open) return;

    const button = open === "account" ? accountButtonRef.current : menuButtonRef.current;
    const panel = open === "account" ? accountRef.current : mobileNavRef.current;

    function closeOutside(event: Event) {
      const target = event.target;
      if (target instanceof Node && !panel?.contains(target) && !button?.contains(target)) {
        setOpen(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(null);
        button?.focus();
      }
    }

    function closeOnBreakpointChange() {
      setOpen(null);
    }

    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    desktopViewport.addEventListener("change", closeOnBreakpointChange);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      desktopViewport.removeEventListener("change", closeOnBreakpointChange);
    };
  }, [open]);

  const accountItems = accountLinks.map((link) => {
    const active = isCurrent(pathname, link.href);
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(null)}
        className={menuLinkClass(active)}
      >
        <Icon aria-hidden className="h-5 w-5 shrink-0" />
        {link.label}
      </Link>
    );
  });

  const signOut = (
    <form action={logoutAction} className="mt-1 border-t border-[var(--line)] pt-1">
      <button type="submit" className={menuLinkClass(false)}>
        <LogOut aria-hidden className="h-5 w-5 shrink-0" />
        Sign out
      </button>
    </form>
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
        {navigationLinks.map((link) => {
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

        {userId ? (
          <>
            <Link
              href="/notifications"
              aria-current={isCurrent(pathname, "/notifications") ? "page" : undefined}
              aria-label={notificationLabel}
              className={desktopLinkClass(isCurrent(pathname, "/notifications"))}
            >
              <Bell aria-hidden className="h-5 w-5 shrink-0" />
              {unread > 0 && (
                <span aria-hidden className="text-xs font-semibold text-[var(--accent-strong)]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <div ref={accountRef} className="relative">
              <button
                ref={accountButtonRef}
                type="button"
                aria-controls="account-navigation"
                aria-expanded={open === "account"}
                onClick={() => setOpen((current) => current === "account" ? null : "account")}
                className={desktopLinkClass(accountActive || open === "account")}
              >
                Account
                <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open === "account" ? "rotate-180" : ""}`} />
              </button>
              {open === "account" && (
                <div id="account-navigation" className="panel absolute right-0 top-full z-50 mt-2 w-56 p-1.5">
                  {accountItems}
                  {signOut}
                </div>
              )}
            </div>
          </>
        ) : (
          <Link href="/login" className={desktopLinkClass(isCurrent(pathname, "/login"))}>
            Sign in
          </Link>
        )}
      </nav>

      {!isCurrent(pathname, "/mods/new") && (
        <Link href="/mods/new" onClick={() => setOpen(null)} className="button-secondary !px-2.5 sm:!px-3.5">
          <Upload aria-hidden className="hidden h-5 w-5 shrink-0 sm:block" />
          Post a beta
        </Link>
      )}

      <button
        ref={menuButtonRef}
        type="button"
        aria-label={`${open === "mobile" ? "Close" : "Open"} navigation menu${userId && unread > 0 ? `, ${unread} unread notifications` : ""}`}
        aria-controls="mobile-navigation"
        aria-expanded={open === "mobile"}
        onClick={() => setOpen((current) => current === "mobile" ? null : "mobile")}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--text-soft)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)] lg:hidden"
      >
        {open === "mobile" ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        {userId && unread > 0 && (
          <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        )}
      </button>

      {open === "mobile" && (
        <nav
          ref={mobileNavRef}
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-[var(--line)] bg-[var(--background)] p-3 lg:hidden"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-1">
            {navigationLinks.map((link) => {
              const active = isCurrent(pathname, link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(null)}
                  className={menuLinkClass(active)}
                >
                  <Icon aria-hidden className="h-5 w-5 shrink-0" />
                  {link.label}
                </Link>
              );
            })}

            {userId ? (
              <>
                <Link
                  href="/notifications"
                  aria-current={isCurrent(pathname, "/notifications") ? "page" : undefined}
                  aria-label={notificationLabel}
                  onClick={() => setOpen(null)}
                  className={menuLinkClass(isCurrent(pathname, "/notifications"))}
                >
                  <Bell aria-hidden className="h-5 w-5 shrink-0" />
                  Notifications
                  {unread > 0 && <span aria-hidden className="ml-auto text-xs text-[var(--accent-strong)]">{unread > 99 ? "99+" : unread}</span>}
                </Link>
                <div className="mt-1 border-t border-[var(--line)] pt-1">
                  {accountItems}
                  {signOut}
                </div>
              </>
            ) : (
              <Link href="/login" onClick={() => setOpen(null)} className={menuLinkClass(isCurrent(pathname, "/login"))}>
                <LogIn aria-hidden className="h-5 w-5 shrink-0" />
                Sign in
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

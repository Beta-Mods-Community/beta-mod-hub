import Link from "next/link";

const navLinks = [
  { href: "/browse", label: "Browse" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
        >
          Beta Mod Hub
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
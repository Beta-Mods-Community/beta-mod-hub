import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const footerLinks = [
  { href: "/browse", label: "Browse betas" },
  { href: "/mods/new", label: "Post a beta" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contact", label: "Contact" },
  { href: "/rules", label: "Site rules" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-black/15">
      <div className="site-container grid gap-8 py-10 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-sm font-black text-[var(--accent-strong)]"
            >
              β
            </span>
            <p className="text-sm font-semibold tracking-tight text-[var(--text)]">
              Beta Mods
            </p>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Upload beta mods, download test builds, and report bugs.
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
            />
            Uploaded builds are quarantined and malware-scanned before they are
            stored or shared.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--accent-strong)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-[var(--line)]">
        <div className="site-container flex flex-col gap-2 py-4 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Beta Mods is an independent site and is not affiliated with Nexus Mods.</p>
        </div>
      </div>
    </footer>
  );
}

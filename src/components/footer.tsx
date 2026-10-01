import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ContextHelp from "./context-help";

const footerLinks = [
  { href: "/contact", label: "Contact" },
  { href: "/rules", label: "Rules" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-[var(--surface-soft)]">
      <div className="site-container grid gap-4 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
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
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            An independent site, not affiliated with Nexus Mods.
          </p>
          <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
            <ContextHelp title="Malware scanning" label="About malware scanning" description="Uploads must pass the site's malware checks before they can be shared. A clean result is not a guarantee of safety, stability, or compatibility. Read the author's requirements and test beta builds with backed-up saves." className="shrink-0">
              <ShieldCheck
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
              />
            </ContextHelp>
            Uploads are malware-scanned before sharing. Scans cannot guarantee safety.
          </p>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center rounded-sm text-sm text-[var(--muted)] transition-colors hover:text-[var(--accent-strong)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

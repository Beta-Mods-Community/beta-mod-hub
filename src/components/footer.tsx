import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import ContextHelp from "./context-help";
import BrandMark from "./brand-mark";

const footerLinks = [
  { href: "/help", label: "Help" },
  { href: "/contact", label: "Contact" },
  { href: "/rules", label: "Rules" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto bg-background">
      <div className="site-container section-divider" aria-hidden="true" />
      <div className="site-container grid gap-4 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <p className="text-sm font-semibold tracking-tight text-[var(--text)]">
              Beta Mods
            </p>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            An independent site, not affiliated with Nexus Mods.
          </p>
          <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
            <ContextHelp
              title="Malware scanning"
              label="About malware scanning"
              description="Uploads must pass the site's malware checks before they can be shared. A clean result is not a guarantee of safety, stability, or compatibility. Read the author's requirements and test beta builds with backed-up saves."
              className="shrink-0"
            >
              <ShieldCheck
                aria-hidden
                className="h-5 w-5 shrink-0 text-text-soft"
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

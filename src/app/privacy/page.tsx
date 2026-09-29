import Link from "next/link";
export const metadata = { title: "Privacy" };
export default function PrivacyPage() {
  return <main className="site-container w-full max-w-3xl flex-1 py-12"><h1 className="text-3xl font-semibold">Privacy during the pilot</h1>
    <div className="panel mt-6 space-y-5 p-6 text-sm leading-7">
      <h2 className="text-lg font-semibold">Account and activity</h2>
      <p>We store your email address, password hash, profile, mod listings, uploads, votes, follows, and bug reports to operate the site. Verification and password-reset links expire and can be used once. Login attempts are limited using account and request information.</p>
      <h2 className="text-lg font-semibold">What other people can see</h2>
      <p>Your display name, profile, mod pages, screenshots, bug reports, and testing history are visible to other visitors. Email addresses and authentication credentials are not displayed on public profiles. Bug-report attachments are restricted to the reporter and mod author; remove private information from logs and saves before uploading them.</p>
      <h2 className="text-lg font-semibold">Storage and services</h2>
      <p>Account and site data are stored in Neon Postgres. The pilot stores approved uploads in Cloudflare R2. Files temporarily pass through the site host for malware scanning. Operational logs and database backups may contain account identifiers. Email delivery, once configured, passes account messages to the configured mail provider.</p>
      <h2 className="text-lg font-semibold">Cookies and requests</h2>
      <p>The site uses a session cookie to keep you signed in. Following a link to another website or loading an external profile avatar sends a request to that provider. Downloads use temporary signed storage URLs; anyone you share one with can use it until it expires.</p>
      <h2 className="text-lg font-semibold">Access, correction, and deletion</h2>
      <p>You can edit your profile and remove your own active mod listings. Contact the administrator for account-data access, correction, or deletion requests. Backup copies may remain until their retention period ends; the current backup runbook uses 14 days.</p>
      <Link href="/contact" className="text-[var(--accent)] underline">Contact the administrator</Link>
    </div>
  </main>;
}

import Link from "next/link";
export const metadata = { title: "Contact" };
export default function ContactPage() {
  return <main className="site-container w-full max-w-3xl flex-1 py-12"><h1 className="text-3xl font-semibold">Contact</h1>
    <div className="panel mt-6 space-y-5 p-6 text-sm leading-7">
      <p>For account help, privacy requests, ownership disputes, or problems with the site, email <a className="text-[var(--accent)] underline" href="mailto:admin.betamods@gmail.com">admin.betamods@gmail.com</a>.</p>
      <p>Include the relevant mod page URL and a description of the problem. Do not send passwords, login links, or API keys.</p>
      <p>To report a problem with a mod, use its Bug reports section. To report prohibited content or abuse, use Report this listing on its mod page.</p>
      <p><Link href="/rules" className="text-[var(--accent)] underline">Site rules</Link> · <Link href="/privacy" className="text-[var(--accent)] underline">Privacy</Link></p>
    </div>
  </main>;
}

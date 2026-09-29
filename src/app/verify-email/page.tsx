import Link from "next/link";
import AccountForm from "@/components/account-form";
import { verifyEmail } from "@lib/account-actions";
import { isAccountToken } from "@lib/account-policy";

export const metadata = { title: "Verify email", referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="site-container w-full max-w-md flex-1 py-14"><div className="panel space-y-5 p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">Verify your email</h1>
    {isAccountToken(token) ? <>
      <p className="text-sm text-[var(--text-soft)]">Confirm the email address for your Beta Mods account.</p>
      <AccountForm mode="verify" action={verifyEmail} token={token} />
    </> : <p className="text-sm text-[var(--text-soft)]">This verification link is missing or invalid.</p>}
    <Link href="/account" className="block text-sm text-[var(--accent)] underline underline-offset-4">Account settings</Link>
  </div></main>;
}

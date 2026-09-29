import Link from "next/link";
import AccountForm from "@/components/account-form";
import { resetPassword } from "@lib/account-actions";
import { isAccountToken } from "@lib/account-policy";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="site-container w-full max-w-md flex-1 py-14"><div className="panel space-y-5 p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">Choose a new password</h1>
    {isAccountToken(token) ? <AccountForm mode="reset" action={resetPassword} token={token} /> : <p className="text-sm text-[var(--text-soft)]">This reset link is missing or invalid.</p>}
    <Link href="/forgot-password" className="block text-sm text-[var(--accent)] underline underline-offset-4">Request another reset link</Link>
  </div></main>;
}

import Link from "next/link";
import AccountForm from "@/components/account-form";
import { requestPasswordReset } from "@lib/account-actions";
import { accountMailConfig, MAIL_UNAVAILABLE } from "@lib/account-mail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  const mail = accountMailConfig();
  return <main className="site-container w-full max-w-md flex-1 py-14"><div className="panel space-y-5 p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">Reset your password</h1>
    <p className="text-sm text-[var(--text-soft)]">Enter the address you use to sign in. Reset links expire after 30 minutes.</p>
    {!mail && <p className="text-sm text-amber-200">{MAIL_UNAVAILABLE}</p>}
    {mail?.mode === "preview" && <p className="text-sm text-[var(--muted)]">Local testing: email is saved privately on this PC instead of sent to an inbox.</p>}
    <AccountForm mode="forgot" action={requestPasswordReset} disabled={!mail} />
    <Link href="/login" className="block text-sm text-[var(--accent)] underline underline-offset-4">Back to sign in</Link>
  </div></main>;
}

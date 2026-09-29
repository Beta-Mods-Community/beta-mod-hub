import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@lib/db";
import { users } from "@/db/schema";
import { getSession } from "@lib/session";
import { allowsUnverifiedLocalAccounts } from "@lib/account-policy";
import { accountMailConfig, MAIL_UNAVAILABLE } from "@lib/account-mail";
import { changePassword, resendVerification } from "@lib/account-actions";
import AccountForm from "@/components/account-form";

export const metadata = { title: "Account settings", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const session = await getSession();
  if (!session || !db) redirect("/login");
  const [user] = await db.select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) redirect("/login");
  const { created } = await searchParams;
  const mail = accountMailConfig();
  return (
    <main className="site-container w-full max-w-2xl flex-1 py-10 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Account settings</h1>
      <p className="mt-3 text-sm text-[var(--text-soft)]">Verify your email or change your password. <Link href="/profile/edit" className="text-[var(--accent)] underline underline-offset-4">Edit your public profile</Link></p>
      {created === "1" && <p role="status" className="mt-5 text-sm text-[var(--accent)]">Your account is created. Verify your email before posting or uploading.</p>}
      <section className="panel mt-7 space-y-4 p-5 sm:p-7" aria-labelledby="account-email">
        <h2 id="account-email" className="text-lg font-semibold">Email address</h2>
        <p className="break-words text-sm text-[var(--text-soft)]">{user.email ?? "No email address on this account."}</p>
        {user.emailVerifiedAt ? <p className="text-sm text-[var(--accent)]">Email verified</p> : <>
          <p className="text-sm text-[var(--text-soft)]">Email not yet verified. Verification confirms that you own this address.</p>
          {!mail && <p className="text-sm text-amber-200">{MAIL_UNAVAILABLE}</p>}
          {mail?.mode === "preview" && <p className="text-sm text-[var(--muted)]">Local testing: messages are saved privately on this PC, not delivered to an inbox.</p>}
          {allowsUnverifiedLocalAccounts() && <p className="text-sm text-[var(--muted)]">This local development session permits testing before verification. That setting is disabled in production.</p>}
          {user.email && <AccountForm mode="resend" action={resendVerification} disabled={!mail} />}
        </>}
      </section>
      <section className="panel mt-5 space-y-4 p-5 sm:p-7" aria-labelledby="account-password">
        <h2 id="account-password" className="text-lg font-semibold">Password</h2>
        {user.passwordHash ? <AccountForm mode="change" action={changePassword} /> : <p className="text-sm text-[var(--text-soft)]">This account uses Nexus sign-in and does not have a local password.</p>}
      </section>
      <Link href="/dashboard" className="button-secondary mt-6">Back to dashboard</Link>
    </main>
  );
}

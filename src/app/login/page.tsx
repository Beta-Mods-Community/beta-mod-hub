import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/login-form";
import { getSession } from "@lib/session";
import { ssoConfigured } from "@lib/nexus-sso";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ nexus?: string; password?: string }>;
}) {
  const session = await getSession();
  if (session?.userId) redirect("/dashboard");

  const { nexus, password } = await searchParams;
  const ssoAvailable = ssoConfigured();

  return (
    <main className="site-container flex w-full max-w-md flex-1 flex-col justify-center py-14">
      <div className="panel p-6 sm:p-8">
        <p className="eyebrow">Account</p>
        <h1 className="mb-1 mt-3 text-2xl font-semibold tracking-tight text-[var(--text)]">
          Sign in
        </h1>
        <p className="mb-6 text-sm text-[var(--text-soft)]">
          Sign in to upload mods, report bugs, and vote on builds.
        </p>

        {nexus === "error" && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Nexus sign-in failed. Try again or sign in with your email.
          </p>
        )}
        {nexus === "unconfigured" && (
          <p className="mb-4 rounded-md bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Nexus sign-in isn&apos;t available yet. Use your email and password.
          </p>
        )}

        {ssoAvailable && (
          <>
            <a
              href="/nexus-sso"
            className="button-secondary mb-4 w-full"
            >
              Continue with Nexus
            </a>
            <div className="mb-4 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--line)]" />
              or
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
          </>
        )}

        <LoginForm />
        {(password === "reset" || password === "changed") && <p role="status" className="mt-4 text-sm text-[var(--accent)]">Your password was updated and all devices were signed out. Sign in with your new password.</p>}
        <Link href="/forgot-password" className="mt-4 block text-center text-sm text-[var(--accent)] underline-offset-4 hover:underline">Forgot your password?</Link>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

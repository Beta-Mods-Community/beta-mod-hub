import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/login-form";
import { getSession } from "@lib/session";
import { ssoConfigured } from "@lib/nexus-sso";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ nexus?: string }>;
}) {
  const session = await getSession();
  if (session?.userId) redirect("/dashboard");

  const { nexus } = await searchParams;
  const ssoAvailable = ssoConfigured();

  return (
    <main className="site-container flex w-full max-w-md flex-1 flex-col justify-center py-14">
      <div className="panel p-6 sm:p-8">
        <p className="eyebrow">Release workspace</p>
        <h1 className="mb-1 mt-3 text-2xl font-semibold tracking-tight text-[var(--text)]">
          Welcome back
        </h1>
        <p className="mb-6 text-sm text-[var(--text-soft)]">
          Sign in to manage releases and keep testing.
        </p>

        {nexus === "error" && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Nexus sign-in failed — please try again or sign in with your email.
          </p>
        )}
        {nexus === "unconfigured" && (
          <p className="mb-4 rounded-md bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            Nexus sign-in isn&apos;t available yet — the app isn&apos;t
            registered with Nexus. Use email and password for now.
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

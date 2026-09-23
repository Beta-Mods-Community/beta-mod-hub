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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Welcome back
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to manage your betas.
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
              className="mb-4 flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
            >
              Continue with Nexus
            </a>
            <div className="mb-4 flex items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              or
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </>
        )}

        <LoginForm />
        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/login-form";
import { getSession } from "@lib/session";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.userId) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Welcome back
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in to manage your betas.
        </p>
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
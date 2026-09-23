import Link from "next/link";
import { redirect } from "next/navigation";

import SignupForm from "@/components/signup-form";
import { getSession } from "@lib/session";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const session = await getSession();
  if (session?.userId) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Create your account
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Post betas, test builds, and vote on readiness.
        </p>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
import Link from "next/link";
import { redirect } from "next/navigation";

import SignupForm from "@/components/signup-form";
import { getSession } from "@lib/session";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const session = await getSession();
  if (session?.userId) redirect("/dashboard");

  return (
    <main className="site-container flex w-full max-w-md flex-1 flex-col justify-center py-14">
      <div className="panel p-6 sm:p-8">
        <p className="eyebrow">Closed pilot</p>
        <h1 className="mb-1 mt-3 text-2xl font-semibold tracking-tight text-[var(--text)]">
          Create your account
        </h1>
        <p className="mb-6 text-sm text-[var(--text-soft)]">
          Post betas, test builds, and vote on readiness.
        </p>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--text)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

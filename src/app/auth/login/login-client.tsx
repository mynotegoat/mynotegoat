"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { resolveAuthAccessState } from "@/lib/auth-access";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type LoginClientProps = {
  verifyNotice: boolean;
};

export default function LoginClient({ verifyNotice }: LoginClientProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const supabaseMissing = useMemo(() => !getSupabaseBrowserClient(), []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    const access = await resolveAuthAccessState();
    setLoading(false);

    if (access.state === "access-granted") {
      router.replace("/dashboard");
      return;
    }

    if (access.state === "pending-approval") {
      router.replace("/auth/pending");
      return;
    }

    if (access.state === "email-unverified") {
      setMessage("Your email is not verified yet. Check your inbox and click the verification link first.");
      return;
    }

    setError(access.errorMessage || "We could not complete login. Please try again.");
  };

  const resendVerification = async () => {
    setError("");
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email first so we know where to send the verification link.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/login`;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (resendError) {
      setError(resendError.message);
      return;
    }

    setMessage("Verification email sent. Open your inbox, verify, then log in.");
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
          Note Goat
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-main)]">Sign In</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)]">
          Secure login for your private office workspace.
        </p>
      </div>

      {verifyNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Verify your email first, then sign in.
        </div>
      ) : null}

      {supabaseMissing ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Supabase environment variables are missing in this deployment.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-[var(--text-main)]">Email</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="w-full rounded-[14px] border border-[var(--line-strong)] bg-white px-4 py-3 text-[17px] outline-none focus:border-[var(--brand-primary)]"
            placeholder="you@clinic.com"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-[var(--text-main)]">Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            className="w-full rounded-[14px] border border-[var(--line-strong)] bg-white px-4 py-3 text-[17px] outline-none focus:border-[var(--brand-primary)]"
            placeholder="Your password"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || supabaseMissing}
            className="rounded-[14px] bg-[var(--brand-primary)] px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={resendVerification}
            disabled={loading || supabaseMissing}
            className="rounded-[14px] border border-[var(--line-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text-main)] disabled:opacity-50"
          >
            Resend Verification
          </button>
        </div>
      </form>

      <p className="text-sm text-[var(--text-muted)]">
        No account yet?{" "}
        <Link className="font-semibold text-[var(--brand-primary)]" href="/auth/signup">
          Create one
        </Link>
      </p>
    </div>
  );
}

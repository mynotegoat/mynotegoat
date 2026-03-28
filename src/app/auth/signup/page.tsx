"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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

    const redirectTo = `${window.location.origin}/auth/login`;

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage(
      "Account created. Verify your email from your inbox, then sign in. Access stays locked until admin approval.",
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
          Note Goat
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-main)]">Create Account</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)]">
          Sign up with your clinic email. You will verify email first, then wait for approval.
        </p>
      </div>

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
            placeholder="doctor@clinic.com"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-[var(--text-main)]">Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={8}
            className="w-full rounded-[14px] border border-[var(--line-strong)] bg-white px-4 py-3 text-[17px] outline-none focus:border-[var(--brand-primary)]"
            placeholder="At least 8 characters"
          />
        </label>

        <button
          type="submit"
          disabled={loading || supabaseMissing}
          className="rounded-[14px] bg-[var(--brand-primary)] px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-sm text-[var(--text-muted)]">
        Already signed up?{" "}
        <Link className="font-semibold text-[var(--brand-primary)]" href="/auth/login">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

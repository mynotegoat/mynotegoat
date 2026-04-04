"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type PlanOption = {
  tier: "tracking" | "track_schedule" | "complete";
  name: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

const PLANS: PlanOption[] = [
  {
    tier: "tracking",
    name: "Tracking",
    description: "Patient management essentials",
    features: [
      "Dashboard",
      "Patient Records",
      "Statistics",
      "Tasks",
      "Contacts",
      "Key Dates",
      "Settings",
    ],
  },
  {
    tier: "track_schedule",
    name: "Track & Schedule",
    description: "Add scheduling to your workflow",
    features: [
      "Everything in Tracking",
      "Appointment Scheduling",
    ],
    highlight: true,
  },
  {
    tier: "complete",
    name: "Complete",
    description: "Full practice management suite",
    features: [
      "Everything in Track & Schedule",
      "Encounter Notes / SOAP",
      "Billing",
    ],
  },
];

export default function SignupPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
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

    if (!selectedPlan) {
      setError("Please select a plan first.");
      return;
    }

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
        data: {
          selected_plan: selectedPlan,
        },
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
          Choose your plan, then sign up with your clinic email.
        </p>
      </div>

      {/* Plan Selection */}
      <div>
        <span className="text-sm font-semibold text-[var(--text-main)]">Select Plan</span>
        <div className="mt-2 grid gap-3">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.tier;
            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => setSelectedPlan(plan.tier)}
                className={`relative rounded-[14px] border-2 px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-[var(--brand-primary)] bg-[#ecf4fa]"
                    : "border-[var(--line-strong)] bg-white hover:border-[#9ab8cc]"
                } ${plan.highlight && !isSelected ? "border-[#9ab8cc]" : ""}`}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-[var(--text-main)]">{plan.name}</span>
                  {plan.highlight && (
                    <span className="rounded-full bg-[var(--brand-primary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Popular
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{plan.description}</p>
                <ul className="mt-2 space-y-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-1.5 text-sm text-[var(--text-main)]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-emerald-500">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
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
          disabled={loading || supabaseMissing || !selectedPlan}
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

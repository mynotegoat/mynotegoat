"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "suspended";

export interface AuthAccessState {
  state:
    | "supabase-missing"
    | "signed-out"
    | "email-unverified"
    | "pending-approval"
    | "access-granted"
    | "error";
  email?: string;
  userId?: string;
  approvalStatus?: ApprovalStatus;
  errorMessage?: string;
}

function normalizeApprovalStatus(value: unknown): ApprovalStatus {
  if (value === "approved") {
    return "approved";
  }
  if (value === "rejected") {
    return "rejected";
  }
  if (value === "suspended") {
    return "suspended";
  }
  return "pending";
}

export async function resolveAuthAccessState(): Promise<AuthAccessState> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { state: "supabase-missing" };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      state: "error",
      errorMessage: sessionError.message,
    };
  }

  const user = session?.user;
  if (!user) {
    return { state: "signed-out" };
  }

  if (!user.email_confirmed_at) {
    return {
      state: "email-unverified",
      email: user.email ?? undefined,
      userId: user.id,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("account_profiles")
    .select("approval_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      state: "error",
      email: user.email ?? undefined,
      userId: user.id,
      errorMessage: profileError.message,
    };
  }

  const approvalStatus = normalizeApprovalStatus(profile?.approval_status);

  if (approvalStatus !== "approved") {
    return {
      state: "pending-approval",
      email: user.email ?? undefined,
      userId: user.id,
      approvalStatus,
    };
  }

  return {
    state: "access-granted",
    email: user.email ?? undefined,
    userId: user.id,
    approvalStatus,
  };
}

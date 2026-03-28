"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/patients", label: "Patients" },
  { href: "/statistics", label: "Statistics" },
  { href: "/tasks", label: "My Tasks" },
  { href: "/contacts", label: "Contacts" },
  { href: "/appointments", label: "Schedule" },
  { href: "/encounters", label: "Encounters" },
  { href: "/key-dates", label: "Key Dates" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function buildTitle(pathname: string) {
  const item = navItems.find((entry) => pathname.startsWith(entry.href));
  return item?.label ?? "Note Goat";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setUserEmail(data.session?.user?.email ?? "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }
      setUserEmail(session?.user?.email ?? "");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      window.location.href = "/auth/login";
      return;
    }

    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1680px] px-3 py-3 lg:px-5 lg:py-5">
        <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/60 shadow-[0_18px_50px_rgba(16,38,58,0.1)] backdrop-blur-sm">
          <div className="grid min-h-[calc(100vh-2rem)] lg:grid-cols-[250px_1fr]">
            <aside className="hidden border-r border-[var(--line-soft)] bg-[var(--bg-sidebar)] p-6 text-[#e4f4ff] lg:block">
              <div className="mb-8">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[#79d9d2]">
                  Note Goat
                </div>
                <h2 className="mt-2 text-[28px] font-semibold">Clinic OS</h2>
                <p className="mt-2 text-sm text-[#aad0e4]">Private office workspace</p>
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={classNames(
                        "block rounded-xl px-4 py-3 text-sm font-semibold transition",
                        active
                          ? "bg-gradient-to-r from-[#157bbf] to-[#1a9ba9] text-white"
                          : "text-[#d5ebf8] hover:bg-white/10",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-8 rounded-xl border border-white/20 bg-white/10 p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-[#8fd8d3]">
                  Workspace
                </div>
                <p className="mt-2 break-all text-sm leading-snug text-[#d8ecfa]">
                  {userEmail || "Signed in"}
                </p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-50"
                >
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </aside>

            <section className="min-w-0">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] bg-white/70 px-4 py-4 lg:px-7 lg:py-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Note Goat
                  </div>
                  <h1 className="text-2xl font-semibold text-[var(--text-main)]">
                    {buildTitle(pathname)}
                  </h1>
                </div>
                <div className="inline-flex items-center rounded-full bg-[var(--bg-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]">
                  {userEmail || "Secure cloud mode"}
                </div>
              </header>

              <nav className="flex gap-2 overflow-x-auto border-b border-[var(--line-soft)] bg-white/70 px-3 py-3 lg:hidden">
                {navItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={classNames(
                        "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold",
                        active
                          ? "bg-[var(--brand-primary)] text-white"
                          : "bg-[var(--bg-soft)] text-[var(--text-main)]",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <main className="p-4 lg:p-7">{children}</main>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

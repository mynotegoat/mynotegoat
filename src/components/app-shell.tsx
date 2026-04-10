"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { wipeLocalWorkspaceForSignOut } from "@/lib/cloud-state";
import { getVisiblePortalNavItems, type PlanTier } from "@/lib/plan-access";

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function buildTitle(pathname: string, items: { href: string; label: string }[]) {
  const item = items.find((entry) => pathname.startsWith(entry.href));
  return item?.label ?? "My Note Goat";
}

const SIDEBAR_COLLAPSED_KEY = "casemate.sidebar-collapsed";

export function AppShell({
  children,
  planTier = "complete",
}: {
  children: React.ReactNode;
  planTier?: PlanTier;
}) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [showBrandLogo, setShowBrandLogo] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const navItems = useMemo(() => getVisiblePortalNavItems(planTier), [planTier]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

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
    // Wipe every casemate.* key so the next user to use this browser
    // starts with a truly empty slate. Defense-in-depth: the portal
    // bootstrap also re-checks on mount.
    wipeLocalWorkspaceForSignOut();
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1680px] px-3 py-3 lg:px-5 lg:py-5">
        <div className="rounded-[30px] border border-white/70 bg-white shadow-[0_18px_50px_rgba(16,38,58,0.1)]">
          <div
            className={classNames(
              "grid min-h-[calc(100vh-2rem)]",
              sidebarCollapsed
                ? "lg:grid-cols-[56px_1fr]"
                : "lg:grid-cols-[250px_1fr]",
            )}
            style={{ transition: "grid-template-columns 0.2s ease" }}
          >
            <aside className="sticky top-0 hidden max-h-screen overflow-y-auto overflow-x-hidden rounded-l-[30px] border-r border-[var(--line-soft)] bg-[var(--bg-sidebar)] text-[#e4f4ff] lg:block">
              <div className={sidebarCollapsed ? "p-2" : "p-6"}>
                {/* Collapse toggle */}
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="mb-4 flex w-full items-center justify-center rounded-lg bg-white/10 p-2 text-white/70 transition hover:bg-white/20 hover:text-white"
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={classNames("h-5 w-5 transition-transform", sidebarCollapsed && "rotate-180")}
                  >
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>

                {!sidebarCollapsed && (
                  <>
                    <div className="mb-8">
                      <div className="rounded-2xl border border-white/15 bg-white/5 px-3 py-3">
                        {showBrandLogo ? (
                          <img
                            src="/mynotegoatlogo.png"
                            alt="My Note Goat"
                            className="h-20 w-full object-contain"
                            onError={() => setShowBrandLogo(false)}
                          />
                        ) : (
                          <div className="text-center text-xl font-semibold tracking-wide text-white">
                            My Note Goat
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-[#aad0e4]">Secure office workspace</p>
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
                  </>
                )}

                {sidebarCollapsed && (
                  <nav className="mt-2 space-y-2">
                    {navItems.map((item) => {
                      const active =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={classNames(
                            "flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition",
                            active
                              ? "bg-gradient-to-r from-[#157bbf] to-[#1a9ba9] text-white"
                              : "text-[#d5ebf8] hover:bg-white/10",
                          )}
                          title={item.label}
                        >
                          {item.label.charAt(0)}
                        </Link>
                      );
                    })}
                  </nav>
                )}
              </div>
            </aside>

            <section className="min-w-0">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] bg-white/70 px-4 py-4 lg:px-7 lg:py-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    My Note Goat
                  </div>
                  <h1 className="text-2xl font-semibold text-[var(--text-main)]">
                    {buildTitle(pathname, navItems)}
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

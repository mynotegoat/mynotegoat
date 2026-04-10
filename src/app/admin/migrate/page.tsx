"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  parseCasemateSql,
  getChiroPreviews,
  buildMigrationPayload,
  type CasemateData,
  type ChiroMigrationPreview,
} from "@/lib/casemate-sql-parser";

interface AccountRow {
  user_id: string;
  email: string;
}

interface MigrationResult {
  chiroId: number;
  chiroName: string;
  targetEmail: string;
  patientsInserted: number;
  contactsInserted: number;
  errors: string[];
}

export default function MigrateCasematePage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [parsedData, setParsedData] = useState<CasemateData | null>(null);
  const [previews, setPreviews] = useState<ChiroMigrationPreview[]>([]);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [migrating, setMigrating] = useState<number | null>(null);
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [parseError, setParseError] = useState("");

  // Load all approved accounts for the mapping dropdown
  useEffect(() => {
    async function loadAccounts() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase
        .from("accounts")
        .select("user_id, email")
        .eq("approval_status", "approved")
        .order("email");
      if (data) setAccounts(data);
    }
    void loadAccounts();
  }, []);

  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setParseError("");
      setParsedData(null);
      setPreviews([]);
      setResults([]);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const sql = e.target?.result as string;
          const data = parseCasemateSql(sql);
          setParsedData(data);
          const chiroList = getChiroPreviews(data);
          setPreviews(chiroList);

          // Auto-map by matching chiro owner email to account email
          const autoMap: Record<number, string> = {};
          chiroList.forEach((preview) => {
            const match = accounts.find(
              (a) =>
                a.email.toLowerCase() === preview.ownerEmail.toLowerCase()
            );
            if (match) {
              autoMap[preview.chiro.chiro_id] = match.user_id;
            }
          });
          setMappings(autoMap);
        } catch {
          setParseError("Failed to parse SQL file. Make sure it is a valid MySQL dump.");
        }
      };
      reader.readAsText(file);
    },
    [accounts]
  );

  const handleMigrate = useCallback(
    async (chiroId: number) => {
      if (!parsedData) return;
      const userId = mappings[chiroId];
      if (!userId) return;

      const preview = previews.find((p) => p.chiro.chiro_id === chiroId);
      if (!preview) return;

      const account = accounts.find((a) => a.user_id === userId);
      if (!account) return;

      const workspaceId = `${userId}:main-office`;

      setMigrating(chiroId);
      try {
        const payload = buildMigrationPayload(parsedData, chiroId);

        const supabase = getSupabaseBrowserClient();
        if (!supabase) throw new Error("No supabase client");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const res = await fetch("/api/admin/migrate-casemate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            workspaceId,
            patients: payload.patients,
            contacts: payload.contacts,
          }),
        });

        const result = await res.json();

        setResults((prev) => [
          ...prev,
          {
            chiroId,
            chiroName: preview.chiro.chiro_name,
            targetEmail: account.email,
            patientsInserted: result.patientsInserted ?? 0,
            contactsInserted: result.contactsInserted ?? 0,
            errors: result.errors ?? (result.error ? [result.error] : []),
          },
        ]);
      } catch (err) {
        setResults((prev) => [
          ...prev,
          {
            chiroId,
            chiroName: preview.chiro.chiro_name,
            targetEmail: account.email,
            patientsInserted: 0,
            contactsInserted: 0,
            errors: [err instanceof Error ? err.message : "Unknown error"],
          },
        ]);
      }
      setMigrating(null);
    },
    [parsedData, mappings, previews, accounts]
  );

  const handleMigrateAll = useCallback(async () => {
    for (const preview of previews) {
      const chiroId = preview.chiro.chiro_id;
      if (!mappings[chiroId]) continue;
      if (results.some((r) => r.chiroId === chiroId && r.errors.length === 0)) continue;
      await handleMigrate(chiroId);
    }
  }, [previews, mappings, results, handleMigrate]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Migrate from Casemate</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Upload a MySQL dump from the old Casemate system to import patients
            and contacts into My Note Goat workspaces.
          </p>
        </div>
        <a
          href="/admin"
          className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-soft)]"
        >
          Back to Admin
        </a>
      </div>

      {/* Step 1: Upload SQL file */}
      <section className="rounded-2xl border border-[var(--line-soft)] bg-white p-5">
        <h3 className="text-lg font-semibold">Step 1: Upload SQL File</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Select the <code>casemate.sql</code> MySQL dump file.
        </p>
        <input
          type="file"
          accept=".sql"
          onChange={handleFileUpload}
          className="mt-3 block text-sm"
        />
        {parseError && (
          <p className="mt-2 text-sm font-semibold text-red-600">{parseError}</p>
        )}
        {parsedData && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
              {parsedData.patients.length} patients
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800">
              {parsedData.chiros.length} offices
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">
              {parsedData.lawyers.length} attorneys
            </span>
            <span className="rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-800">
              {parsedData.rolodex.length} contacts
            </span>
          </div>
        )}
      </section>

      {/* Step 2: Map offices to accounts */}
      {previews.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--line-soft)] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                Step 2: Map Offices to My Note Goat Accounts
              </h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                For each Casemate office, select which My Note Goat user should
                receive the data.
              </p>
            </div>
            <button
              type="button"
              onClick={handleMigrateAll}
              disabled={migrating !== null || Object.keys(mappings).length === 0}
              className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Migrate All Mapped
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {previews.map((preview) => {
              const chiroId = preview.chiro.chiro_id;
              const result = results.find((r) => r.chiroId === chiroId);
              const isMigrating = migrating === chiroId;

              return (
                <div
                  key={chiroId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-4"
                >
                  <div className="min-w-[200px] flex-1">
                    <div className="font-semibold">
                      {preview.chiro.chiro_name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {preview.chiro.chiro_city}, {preview.chiro.chiro_state}
                      {" | "}Owner: {preview.ownerEmail}
                    </div>
                    <div className="mt-1 flex gap-2 text-xs">
                      <span className="rounded bg-white px-2 py-0.5 font-semibold">
                        {preview.patientCount} patients
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 font-semibold">
                        {preview.contactCount} contacts
                      </span>
                    </div>
                  </div>

                  <select
                    value={mappings[chiroId] ?? ""}
                    onChange={(e) =>
                      setMappings((prev) => ({
                        ...prev,
                        [chiroId]: e.target.value,
                      }))
                    }
                    className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-sm"
                  >
                    <option value="">-- Select account --</option>
                    {accounts.map((a) => (
                      <option key={a.user_id} value={a.user_id}>
                        {a.email}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleMigrate(chiroId)}
                    disabled={!mappings[chiroId] || isMigrating}
                    className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isMigrating ? "Migrating..." : "Migrate"}
                  </button>

                  {result && (
                    <div className="w-full">
                      {result.errors.length === 0 ? (
                        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                          Migrated {result.patientsInserted} patients,{" "}
                          {result.contactsInserted} contacts to{" "}
                          {result.targetEmail}
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                          {result.patientsInserted} patients,{" "}
                          {result.contactsInserted} contacts.
                          <br />
                          Errors: {result.errors.join("; ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Results summary */}
      {results.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--line-soft)] bg-white p-5">
          <h3 className="text-lg font-semibold">Migration Results</h3>
          <div className="mt-3 space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  r.errors.length === 0
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                <span className="font-semibold">{r.chiroName}</span>{" "}
                &rarr; {r.targetEmail}: {r.patientsInserted} patients,{" "}
                {r.contactsInserted} contacts
                {r.errors.length > 0 && (
                  <span className="block text-xs">{r.errors.join("; ")}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

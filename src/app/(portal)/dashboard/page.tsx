"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/stat-card";
import { useCaseStatuses } from "@/hooks/use-case-statuses";
import { useDashboardWorkspaceSettings } from "@/hooks/use-dashboard-workspace-settings";
import { usePatientFollowUpOverrides } from "@/hooks/use-patient-follow-up-overrides";
import { usePriorityCaseRules } from "@/hooks/use-priority-case-rules";
import { withAlpha } from "@/lib/color-utils";
import { buildFollowUpItems, formatUsDateDisplay } from "@/lib/follow-up-queue";
import { appointments, patients } from "@/lib/mock-data";
import { loadTasks, type TaskPriority, type TaskRecord } from "@/lib/tasks";

function parseDateValue(dateValue: string) {
  const trimmed = dateValue.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    const rawYear = slashDate[3];
    const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function daysSince(dateValue: string) {
  const now = new Date();
  const sinceDate = parseDateValue(dateValue);
  if (!sinceDate) {
    return null;
  }
  const diffMs = now.getTime() - sinceDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function extractLeadingDate(rawValue?: string) {
  if (!rawValue) {
    return null;
  }
  const match = rawValue.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/);
  return match?.[0] ?? null;
}

function getPriorityBadgeClass(reasons: string[]) {
  if (reasons.some((reason) => reason.toLowerCase().includes("no update"))) {
    return "alert";
  }
  if (reasons.some((reason) => reason.toLowerCase().includes("mri"))) {
    return "warning";
  }
  if (reasons.some((reason) => reason.toLowerCase().includes("dropped"))) {
    return "alert";
  }
  if (reasons.some((reason) => reason.toLowerCase().includes("submitted"))) {
    return "warning";
  }
  if (reasons.some((reason) => reason.toLowerCase().includes("status check"))) {
    return "warning";
  }
  return "active";
}

function getTaskPriorityBadgeClass(priority: TaskPriority) {
  if (priority === "Urgent") {
    return "bg-[rgba(201,66,58,0.14)] text-[#b43b34]";
  }
  if (priority === "High") {
    return "bg-[rgba(238,139,42,0.18)] text-[#9a5a00]";
  }
  if (priority === "Medium") {
    return "bg-[rgba(21,123,191,0.14)] text-[#0b5c93]";
  }
  return "bg-[rgba(25,109,58,0.12)] text-[#196d3a]";
}

function compareTasksForDashboard(left: TaskRecord, right: TaskRecord) {
  if (left.done !== right.done) {
    return left.done ? 1 : -1;
  }
  if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }
  if (left.dueDate && !right.dueDate) {
    return -1;
  }
  if (!left.dueDate && right.dueDate) {
    return 1;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

export default function DashboardPage() {
  const { caseStatuses, lienLabel } = useCaseStatuses();
  const { priorityRules } = usePriorityCaseRules();
  const { dashboardWorkspaceSettings } = useDashboardWorkspaceSettings();
  const { recordsByPatientId: followUpOverridesByPatientId } = usePatientFollowUpOverrides();
  const [tasksSnapshot, setTasksSnapshot] = useState<TaskRecord[]>(() => loadTasks());

  useEffect(() => {
    const refresh = () => setTasksSnapshot(loadTasks());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "casemate.tasks.v1") {
        refresh();
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    patients.forEach((patient) => {
      counts[patient.caseStatus] = (counts[patient.caseStatus] ?? 0) + 1;
    });
    return counts;
  }, []);

  const computedStats = useMemo(() => {
    const activeStatuses = new Set(
      caseStatuses
        .filter((status) => !status.isCaseClosed)
        .map((status) => status.name.toLowerCase()),
    );
    const totalActive = patients.filter((p) =>
      activeStatuses.has(p.caseStatus.toLowerCase()),
    ).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAppointments = appointments.filter((a) =>
      a.start.startsWith(todayStr),
    ).length;

    const dischargedPatients = patients.filter((p) => {
      const status = p.caseStatus.toLowerCase();
      return status.includes("discharg") || status.includes("paid") || status.includes("dropped");
    });
    let avgDays = 0;
    if (dischargedPatients.length > 0) {
      const totalDays = dischargedPatients.reduce((sum, p) => {
        const initial = parseDateValue(p.matrix?.initialExam ?? "");
        const discharge = parseDateValue(p.matrix?.discharge ?? "");
        if (initial && discharge) {
          return sum + Math.max(0, Math.floor((discharge.getTime() - initial.getTime()) / (1000 * 60 * 60 * 24)));
        }
        return sum;
      }, 0);
      const countWithDates = dischargedPatients.filter((p) => {
        const initial = parseDateValue(p.matrix?.initialExam ?? "");
        const discharge = parseDateValue(p.matrix?.discharge ?? "");
        return initial && discharge;
      }).length;
      avgDays = countWithDates > 0 ? totalDays / countWithDates : 0;
    }

    return [
      { label: "Total Active Cases", value: String(totalActive) },
      { label: "Total Patients", value: String(patients.length) },
      { label: "Today Appointments", value: String(todayAppointments) },
      { label: "Avg Days Initial To Discharge", value: avgDays > 0 ? avgDays.toFixed(1) : "-" },
    ];
  }, [caseStatuses]);

  const dashboardStatuses = useMemo(
    () => caseStatuses.filter((status) => status.showOnDashboard),
    [caseStatuses],
  );
  const closedCaseStatuses = useMemo(
    () => caseStatuses.filter((status) => status.isCaseClosed).map((status) => status.name),
    [caseStatuses],
  );

  const priorityCases = useMemo(() => {
    const closedStatuses = new Set(closedCaseStatuses.map((status) => status.toLowerCase()));

    return patients
      .map((patient) => {
        if (closedStatuses.has(patient.caseStatus.toLowerCase())) {
          return null;
        }

        const reasons: string[] = [];

        const statusLower = patient.caseStatus.toLowerCase();
        const rbSentDate = extractLeadingDate(patient.matrix?.rbSent);
        const rbSentDays = rbSentDate ? daysSince(rbSentDate) : null;
        const initialExamDate = extractLeadingDate(patient.matrix?.initialExam);
        const initialExamDays = initialExamDate ? daysSince(initialExamDate) : null;
        const staleDays = daysSince(patient.lastUpdate) ?? 0;
        const hasMriLogged = Boolean(
          patient.matrix?.mriSent ||
            patient.matrix?.mriScheduled ||
            patient.matrix?.mriDone ||
            patient.matrix?.mriReceived ||
            patient.matrix?.mriReviewed,
        );

        const isDischarged = statusLower.includes("discharg");
        const isPaid = statusLower.includes("paid");
        const pauseRules = isDischarged || Boolean(rbSentDate);

        if (
          priorityRules.includeMriDue &&
          !pauseRules &&
          !hasMriLogged &&
          initialExamDays !== null &&
          initialExamDays >= priorityRules.mriDueDaysFromInitial
        ) {
          reasons.push("MRI Due");
        }

        if (
          priorityRules.includeNoUpdate &&
          !pauseRules &&
          staleDays >= priorityRules.noUpdateDaysThreshold
        ) {
          reasons.push(`No update ${staleDays}d`);
        }

        if (
          priorityRules.includeRbStatusCheck &&
          rbSentDays !== null &&
          !isPaid &&
          rbSentDays >= priorityRules.rbStatusCheckDaysThreshold
        ) {
          reasons.push(`R&B status check ${rbSentDays}d`);
        }

        if (!reasons.length) {
          return null;
        }

        return {
          patient,
          reasons,
          staleDays,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => {
        if (b.reasons.length !== a.reasons.length) {
          return b.reasons.length - a.reasons.length;
        }
        return b.staleDays - a.staleDays;
      })
      .slice(0, priorityRules.maxItems);
  }, [closedCaseStatuses, priorityRules]);

  const dashboardTasks = useMemo(() => {
    const openOnly = dashboardWorkspaceSettings.myTasks.openOnly;
    const maxItems = dashboardWorkspaceSettings.myTasks.maxItems;
    const rows = openOnly ? tasksSnapshot.filter((task) => !task.done) : tasksSnapshot;
    return [...rows].sort(compareTasksForDashboard).slice(0, maxItems);
  }, [
    dashboardWorkspaceSettings.myTasks.maxItems,
    dashboardWorkspaceSettings.myTasks.openOnly,
    tasksSnapshot,
  ]);

  const taskCounts = useMemo(() => {
    const open = tasksSnapshot.filter((task) => !task.done).length;
    return {
      total: tasksSnapshot.length,
      open,
      done: tasksSnapshot.length - open,
    };
  }, [tasksSnapshot]);

  const dashboardFollowUpItems = useMemo(
    () =>
      buildFollowUpItems(patients, {
        includeXray: dashboardWorkspaceSettings.patientFollowUp.includeXray,
        includeMriCt: dashboardWorkspaceSettings.patientFollowUp.includeMriCt,
        includeSpecialist: dashboardWorkspaceSettings.patientFollowUp.includeSpecialist,
        includeLienLop: dashboardWorkspaceSettings.patientFollowUp.includeLienLop,
        xrayClearWhen: dashboardWorkspaceSettings.patientFollowUp.xrayClearWhen,
        mriCtClearWhen: dashboardWorkspaceSettings.patientFollowUp.mriCtClearWhen,
        specialistClearWhen: dashboardWorkspaceSettings.patientFollowUp.specialistClearWhen,
        lienLopClearStatuses: dashboardWorkspaceSettings.patientFollowUp.lienLopClearStatuses,
        followUpOverrides: followUpOverridesByPatientId,
        closedCaseStatuses,
        maxItems: dashboardWorkspaceSettings.patientFollowUp.maxItems,
      }),
    [
      closedCaseStatuses,
      dashboardWorkspaceSettings.patientFollowUp.includeLienLop,
      dashboardWorkspaceSettings.patientFollowUp.includeMriCt,
      dashboardWorkspaceSettings.patientFollowUp.includeSpecialist,
      dashboardWorkspaceSettings.patientFollowUp.includeXray,
      dashboardWorkspaceSettings.patientFollowUp.lienLopClearStatuses,
      dashboardWorkspaceSettings.patientFollowUp.maxItems,
      dashboardWorkspaceSettings.patientFollowUp.mriCtClearWhen,
      dashboardWorkspaceSettings.patientFollowUp.specialistClearWhen,
      dashboardWorkspaceSettings.patientFollowUp.xrayClearWhen,
      followUpOverridesByPatientId,
    ],
  );

  const followUpCounts = useMemo(
    () => ({
      total: dashboardFollowUpItems.length,
      xray: dashboardFollowUpItems.filter((item) => item.category === "X-Ray").length,
      mri: dashboardFollowUpItems.filter((item) => item.category === "MRI / CT").length,
      specialist: dashboardFollowUpItems.filter((item) => item.category === "Specialist").length,
      lienLop: dashboardFollowUpItems.filter((item) => item.category === "Lien / LOP").length,
    }),
    [dashboardFollowUpItems],
  );

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {computedStats.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} />
        ))}
      </section>

      <section className="panel-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">Case Status</h3>
          <p className="text-sm text-[var(--text-muted)]">
            Configured in Settings
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {dashboardStatuses.map((status) => (
            <div
              key={status.name}
              className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-white px-4 py-3"
            >
              <span
                aria-hidden
                className="inline-block h-3 w-3 shrink-0 rounded"
                style={{ backgroundColor: withAlpha(status.color, 0.7) }}
              />
              <div>
                <p className="text-xs text-[var(--text-muted)]">{status.name}</p>
                <p className="text-2xl font-semibold leading-tight">{statusCounts[status.name] ?? 0}</p>
              </div>
            </div>
          ))}
          {dashboardStatuses.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              No statuses selected. Go to Settings and enable &quot;Show on Dashboard&quot;.
            </p>
          )}
        </div>
      </section>

      <section className="panel-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Priority Alerts</h3>
          <p className="text-sm text-[var(--text-muted)]">Configured in Settings &gt; Dashboard</p>
        </div>
        <div className="space-y-2">
          {priorityCases.map((entry) => (
            <Link
              key={entry.patient.id}
              href={`/patients/${entry.patient.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line-soft)] bg-white px-3 py-3 transition hover:border-[var(--brand-primary)] hover:shadow-sm"
            >
              <div>
                <p className="font-semibold text-[var(--brand-primary)]">{entry.patient.fullName}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {entry.patient.attorney} • Last update {entry.patient.lastUpdate}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{entry.reasons.join(" • ")}</p>
              </div>
              <span className={`status-pill ${getPriorityBadgeClass(entry.reasons)}`}>
                {entry.reasons[0]}
              </span>
            </Link>
          ))}
          {priorityCases.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              No priority alerts. Adjust rules in Settings &gt; Dashboard.
            </p>
          )}
        </div>
      </section>

      {(dashboardWorkspaceSettings.myTasks.showOnDashboard ||
        dashboardWorkspaceSettings.patientFollowUp.showOnDashboard) && (
        <section className="grid gap-4 xl:grid-cols-2">
          {dashboardWorkspaceSettings.myTasks.showOnDashboard && (
            <article className="panel-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-semibold">My Tasks</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Open {taskCounts.open} • Done {taskCounts.done}
                </p>
              </div>
              <div className="space-y-2">
                {dashboardTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className={`font-semibold ${task.done ? "text-[var(--text-muted)] line-through" : ""}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {task.dueDate ? `Due ${formatUsDateDisplay(task.dueDate)}` : "No due date"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getTaskPriorityBadgeClass(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
                {dashboardTasks.length === 0 && (
                  <p className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-3 text-sm text-[var(--text-muted)]">
                    No tasks to show.
                  </p>
                )}
              </div>
            </article>
          )}

          {dashboardWorkspaceSettings.patientFollowUp.showOnDashboard && (
            <article className="panel-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-semibold">Patient Follow Up</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  X-Ray {followUpCounts.xray} • MRI/CT {followUpCounts.mri} • Specialist{" "}
                  {followUpCounts.specialist} • {lienLabel} {followUpCounts.lienLop}
                </p>
              </div>
              <div className="space-y-2">
                {dashboardFollowUpItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        className="font-semibold text-[var(--brand-primary)] underline underline-offset-2"
                        href={`/patients/${item.patientId}`}
                      >
                        {item.patientName}
                      </Link>
                      <span className="rounded-full bg-[var(--bg-soft)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)]">
                        {item.category === "Lien / LOP" ? lienLabel : item.category}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">{item.stage}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Case {item.caseNumber || "-"} • {item.anchorDate ? formatUsDateDisplay(item.anchorDate) : "No date"}
                      {item.daysFromAnchor !== null &&
                      item.daysFromAnchor >= dashboardWorkspaceSettings.patientFollowUp.staleDaysThreshold
                        ? ` • Stale ${item.daysFromAnchor}d`
                        : ""}
                    </p>
                  </div>
                ))}
                {dashboardFollowUpItems.length === 0 && (
                  <p className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-3 text-sm text-[var(--text-muted)]">
                    No follow-up items to show.
                  </p>
                )}
              </div>
            </article>
          )}
        </section>
      )}
    </div>
  );
}

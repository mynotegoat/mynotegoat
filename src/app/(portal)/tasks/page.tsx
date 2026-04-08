"use client";

import { useMemo, useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { loadDashboardWorkspaceSettings } from "@/lib/dashboard-workspace-settings";
import { patients as allPatients } from "@/lib/mock-data";
import { formatUsDateFromIso, type TaskPriority, type TaskRecord } from "@/lib/tasks";

type StatusFilter = "All" | "Open" | "Done";
type PriorityFilter = "All" | TaskPriority;

function formatUsDateInput(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (!digits) {
    return "";
  }
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIsoFromUsDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return "";
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) {
    return "";
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  const mm = `${month}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function priorityBadgeClass(priority: TaskPriority) {
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

function matchesStatus(task: TaskRecord, filter: StatusFilter) {
  if (filter === "All") {
    return true;
  }
  if (filter === "Done") {
    return task.done;
  }
  return !task.done;
}

export default function TasksPage() {
  const { tasks, addTask, updateTask, toggleTaskDone, removeTask, clearCompleted } = useTasks();

  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("Medium");
  const [quickDueDate, setQuickDueDate] = useState("");
  const [quickPatientId, setQuickPatientId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    loadDashboardWorkspaceSettings().myTasks.openOnly ? "Open" : "All",
  );
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [message, setMessage] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("Medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editError, setEditError] = useState("");

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!matchesStatus(task, statusFilter)) {
        return false;
      }
      if (priorityFilter !== "All" && task.priority !== priorityFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const dueDateUs = formatUsDateFromIso(task.dueDate).toLowerCase();
      return task.title.toLowerCase().includes(query) || dueDateUs.includes(query);
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  const openCount = tasks.filter((task) => !task.done).length;
  const doneCount = tasks.length - openCount;

  const handleAddTask = () => {
    const dueDateIso = quickDueDate.trim() ? toIsoFromUsDate(quickDueDate) : "";
    if (quickDueDate.trim() && !dueDateIso) {
      setMessage("Enter due date as MM/DD/YYYY.");
      return;
    }
    const linkedPatient = quickPatientId ? allPatients.find((p) => p.id === quickPatientId) : undefined;
    const result = addTask({
      title: quickTitle,
      priority: quickPriority,
      dueDate: dueDateIso,
      patientId: linkedPatient?.id,
      patientName: linkedPatient?.fullName,
    });
    if (!result.added) {
      setMessage(result.reason);
      return;
    }
    setQuickTitle("");
    setQuickPriority("Medium");
    setQuickDueDate("");
    setQuickPatientId("");
    setMessage("Task added.");
  };

  const startEditingTask = (task: TaskRecord) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDueDate(formatUsDateFromIso(task.dueDate));
    setEditError("");
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setEditTitle("");
    setEditPriority("Medium");
    setEditDueDate("");
    setEditError("");
  };

  const saveEditingTask = (taskId: string) => {
    const title = editTitle.trim();
    if (!title) {
      setEditError("Task name is required.");
      return;
    }
    const dueDateIso = editDueDate.trim() ? toIsoFromUsDate(editDueDate) : "";
    if (editDueDate.trim() && !dueDateIso) {
      setEditError("Enter due date as MM/DD/YYYY.");
      return;
    }
    updateTask(taskId, {
      title,
      priority: editPriority,
      dueDate: dueDateIso,
    });
    setMessage("Task updated.");
    cancelEditingTask();
  };

  return (
    <div className="space-y-4">
      <section className="panel-card p-4">
        <h4 className="text-lg font-semibold">Quick Add</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-12">
          <label className="grid gap-1 md:col-span-4">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Task *</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="Call attorney re: lien update"
              value={quickTitle}
            />
          </label>
          <label className="grid gap-1 md:col-span-3">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient (optional)</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setQuickPatientId(event.target.value)}
              value={quickPatientId}
            >
              <option value="">— None —</option>
              {allPatients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Priority</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setQuickPriority(event.target.value as TaskPriority)}
              value={quickPriority}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Due Date</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setQuickDueDate(formatUsDateInput(event.target.value))}
              placeholder="MM/DD/YYYY"
              type="text"
              value={quickDueDate}
            />
          </label>
          <div className="flex items-end md:col-span-1">
            <button
              className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddTask}
              type="button"
            >
              Add
            </button>
          </div>
        </div>
        {message && <p className="mt-3 text-sm font-semibold text-[var(--text-muted)]">{message}</p>}
      </section>

      <section className="panel-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-lg font-semibold">Tasks</h4>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-[rgba(21,123,191,0.12)] px-3 py-1 font-semibold text-[#0b5c93]">
              {openCount} Open
            </span>
            <span className="rounded-full bg-[rgba(25,109,58,0.12)] px-3 py-1 font-semibold text-[#196d3a]">
              {doneCount} Done
            </span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-12">
          <label className="grid gap-1 md:col-span-7">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Search</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search task or due date..."
              value={search}
            />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Status</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              value={statusFilter}
            >
              <option value="All">All</option>
              <option value="Open">Open</option>
              <option value="Done">Done</option>
            </select>
            <span className="text-[11px] text-[var(--text-muted)]">
              Default comes from Settings → Reminder Settings → To Do.
            </span>
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Priority</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              value={priorityFilter}
            >
              <option value="All">All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
          <div className="flex items-end md:col-span-1">
            <button
              className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm font-semibold"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all completed tasks?")) {
                  clearCompleted();
                }
              }}
              type="button"
            >
              Clear Done
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {filteredTasks.map((task) => (
            <article
              className={`rounded-xl border px-3 py-3 ${
                task.done ? "border-[var(--line-soft)] bg-[var(--bg-soft)]" : "border-[var(--line-soft)] bg-white"
              }`}
              key={task.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input
                    checked={task.done}
                    className="mt-1"
                    onChange={() => toggleTaskDone(task.id)}
                    type="checkbox"
                  />
                  <div className="grid gap-2">
                    {editingTaskId === task.id ? (
                      <div className="grid gap-2 sm:grid-cols-12">
                        <label className="grid gap-1 sm:col-span-6">
                          <span className="text-xs font-semibold text-[var(--text-muted)]">Task</span>
                          <input
                            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                            onChange={(event) => setEditTitle(event.target.value)}
                            value={editTitle}
                          />
                        </label>
                        <label className="grid gap-1 sm:col-span-3">
                          <span className="text-xs font-semibold text-[var(--text-muted)]">Priority</span>
                          <select
                            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                            onChange={(event) => setEditPriority(event.target.value as TaskPriority)}
                            value={editPriority}
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </label>
                        <label className="grid gap-1 sm:col-span-3">
                          <span className="text-xs font-semibold text-[var(--text-muted)]">Due Date</span>
                          <input
                            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                            inputMode="numeric"
                            maxLength={10}
                            onChange={(event) => setEditDueDate(formatUsDateInput(event.target.value))}
                            placeholder="MM/DD/YYYY"
                            type="text"
                            value={editDueDate}
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <p className={`font-semibold ${task.done ? "text-[var(--text-muted)] line-through" : ""}`}>
                          {task.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Created: {new Date(task.createdAt).toLocaleDateString("en-US")}
                          {task.dueDate ? ` • Due: ${formatUsDateFromIso(task.dueDate)}` : ""}
                          {task.patientName ? ` • Patient: ${task.patientName}` : ""}
                        </p>
                      </>
                    )}
                    {editingTaskId === task.id && editError ? (
                      <p className="text-xs font-semibold text-[#b43b34]">{editError}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {editingTaskId === task.id ? (
                    <>
                      <button
                        className="rounded-lg bg-[var(--brand-primary)] px-3 py-1 text-sm font-semibold text-white"
                        onClick={() => saveEditingTask(task.id)}
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1 text-sm font-semibold"
                        onClick={cancelEditingTask}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${priorityBadgeClass(task.priority)}`}>
                        {task.priority}
                      </span>
                      <select
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
                        onChange={(event) => updateTask(task.id, { priority: event.target.value as TaskPriority })}
                        value={task.priority}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                      <button
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1 text-sm font-semibold"
                        onClick={() => startEditingTask(task)}
                        type="button"
                      >
                        Edit
                      </button>
                    </>
                  )}
                  <button
                    className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1 text-sm font-semibold"
                    onClick={() => {
                      if (!window.confirm("Are you sure you want to remove this task?")) {
                        return;
                      }
                      if (editingTaskId === task.id) {
                        cancelEditingTask();
                      }
                      removeTask(task.id);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
          {filteredTasks.length === 0 && (
            <p className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-4 text-sm text-[var(--text-muted)]">
              No tasks found.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

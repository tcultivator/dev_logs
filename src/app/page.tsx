"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  DEFAULT_ENTRY_TYPE,
  ENTRY_TYPES,
  EntryType,
  TICKET_STATUSES,
  TicketStatus,
  formatDate,
  formatTime,
  isCodeType,
  isOpenTicketStatus,
  isTicketType,
  parseTags,
  statusMeta,
  typeMeta,
} from "@/lib/entries";
import AdminFrame from "@/components/AdminFrame";
import AnalyticsView from "@/components/AnalyticsView";
import ScratchPad from "@/components/ScratchPad";
import ConsolidatedFormatModal from "@/components/ConsolidatedFormatModal";
import {
  buildConsolidatedWeeks,
  downloadConsolidatedDocx,
  type ConsolidatedWeek,
} from "@/lib/consolidated";
import type { ReportFormat } from "@/lib/report-format";
import {
  buildDailyAccomplishmentText,
  downloadTextFile,
  parseInputDate,
  toInputDate,
} from "@/lib/export";

type Project = {
  id: string;
  name: string;
  description: string | null;
  _count?: { entries: number };
};

type Entry = {
  id: string;
  title: string;
  body: string;
  type: EntryType;
  tags: string | null;
  done: boolean;
  status: TicketStatus | null;
  resolvedAt: string | null;
  projectId: string | null;
  createdAt: string;
  project: Project | null;
};

type Page =
  | "dashboard"
  | "analytics"
  | "capture"
  | "logs"
  | "projects"
  | "scratch";

const emptyForm = {
  title: "",
  body: "",
  type: DEFAULT_ENTRY_TYPE as EntryType,
  status: "OPEN" as TicketStatus,
  tags: "",
  projectId: "",
  loggedOn: "",
};

function freshForm() {
  return { ...emptyForm, loggedOn: toInputDate() };
}

function accomplishmentTemplate(name = "") {
  return `DAILY ACCOMPLISHMENT

Name: ${name}
Date: 

Tasks Completed:

`;
}

function accomplishmentName(text: string) {
  const match = text.match(/^Name:\s*(.*)$/im);
  return match?.[1].trim() || "";
}

function entryLogDate(entry: Entry) {
  const source =
    entry.status === "DONE" && entry.resolvedAt
      ? entry.resolvedAt
      : entry.createdAt;
  return toInputDate(new Date(source));
}

function daysAgoInput(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toInputDate(d);
}

function toExportEntry(entry: Entry) {
  return {
    title: entry.title,
    body: entry.body,
    type: entry.type,
    done: entry.done,
    status: entry.status,
    projectName: entry.project?.name ?? null,
  };
}

function statusChipClass(status: TicketStatus | null | undefined) {
  const key = (status || "OPEN").toLowerCase();
  return `chip chip--status-${key}`;
}

async function apiFetch(input: string, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status === 401) {
    window.location.assign("/login");
    throw new Error("Sign in required");
  }
  if (res.status === 403) {
    window.location.assign("/set-password");
    throw new Error("Set a password to continue");
  }
  return res;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [widgetMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("widget");
  });
  const [page, setPage] = useState<Page>(() => {
    if (typeof window === "undefined") return "dashboard";
    const params = new URLSearchParams(window.location.search);
    const p = params.get("page");
    if (
      p &&
      ["dashboard", "analytics", "capture", "logs", "projects", "scratch"].includes(p)
    ) {
      return p as Page;
    }
    return params.has("widget") ? "capture" : "dashboard";
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState(freshForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingEntry, setViewingEntry] = useState<Entry | null>(null);
  const [projectName, setProjectName] = useState("");
  const [exportName, setExportName] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => toInputDate());
  const [dateTo, setDateTo] = useState(() => toInputDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState(() => accomplishmentTemplate());
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState<Entry[]>([]);
  const [doneToday, setDoneToday] = useState<Entry[]>([]);
  const [unassigned, setUnassigned] = useState({ projects: 0, entries: 0 });
  const [claiming, setClaiming] = useState(false);
  const [preparingReport, setPreparingReport] = useState(false);
  const [reportWeeks, setReportWeeks] = useState<ConsolidatedWeek[] | null>(null);

  const loadProjects = useCallback(async () => {
    const res = await apiFetch("/api/projects");
    if (!res.ok) throw new Error("Failed to load projects");
    setProjects(await res.json());
  }, []);

  const loadAlerts = useCallback(async () => {
    const res = await apiFetch("/api/entries?type=TICKET&status=open");
    if (!res.ok) return;
    const tickets = (await res.json()) as Entry[];
    const open = tickets
      .filter((e) => isOpenTicketStatus(e.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    setAlerts(open);
  }, []);

  const loadDoneToday = useCallback(async () => {
    const today = toInputDate();
    const params = new URLSearchParams({
      type: "TICKET",
      status: "DONE",
      dateField: "resolved_at",
      from: today,
      to: today,
    });
    const res = await apiFetch(`/api/entries?${params}`);
    if (!res.ok) return;
    setDoneToday(await res.json());
  }, []);

  const loadEntries = useCallback(async () => {
    if (page === "scratch" || page === "analytics") return;

    const params = new URLSearchParams();

    if (page === "dashboard") {
      params.set("from", daysAgoInput(6));
      params.set("to", toInputDate());
    } else if (page === "capture") {
      params.set("from", toInputDate());
      params.set("to", toInputDate());
    } else if (page === "logs") {
      if (dateFrom || dateTo) {
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        if (dateFrom && !dateTo) params.set("to", dateFrom);
        if (!dateFrom && dateTo) params.set("from", dateTo);
      }
      if (query.trim()) params.set("q", query.trim());
      if (typeFilter) params.set("type", typeFilter);
      if (projectFilter) params.set("projectId", projectFilter);
    }

    const res = await apiFetch(`/api/entries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load entries");
    setEntries(await res.json());
  }, [page, query, typeFilter, projectFilter, dateFrom, dateTo]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const unassignedRes = await apiFetch("/api/account/unassigned");
      const [unassignedData] = await Promise.all([
        unassignedRes.ok
          ? unassignedRes.json()
          : Promise.resolve({ projects: 0, entries: 0 }),
        loadProjects(),
        loadEntries(),
        loadAlerts(),
        loadDoneToday(),
      ]);
      setUnassigned(unassignedData);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach the API. Is MySQL running and .env set?"
      );
    } finally {
      setLoading(false);
    }
  }, [loadProjects, loadEntries, loadAlerts, loadDoneToday]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const name = session?.user?.name?.trim() || "";
    if (!name) return;
    setImportText((current) =>
      current === accomplishmentTemplate() ? accomplishmentTemplate(name) : current
    );
    setExportName((current) => current || name);
  }, [session?.user?.name]);

  useEffect(() => {
    if (!viewingEntry) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setViewingEntry(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewingEntry]);

  const todayKey = toInputDate();

  const todayEntries = useMemo(
    () =>
      entries.filter((e) => toInputDate(new Date(e.createdAt)) === todayKey),
    [entries, todayKey]
  );

  const openTickets = alerts;

  const inProgressCount = useMemo(
    () => alerts.filter((a) => a.status === "IN_PROGRESS").length,
    [alerts]
  );

  const nextOpen = openTickets[0] ?? null;
  const latestDone = doneToday[0] ?? null;

  const weekPoints = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = toInputDate(date);
      const count = entries.filter(
        (entry) => toInputDate(new Date(entry.createdAt)) === key
      ).length;
      const label = date
        .toLocaleDateString(undefined, { weekday: "short" })
        .slice(0, 3)
        .toUpperCase();
      return { key, count, label };
    });
  }, [entries]);

  const activeDateLabel = useMemo(() => {
    const from = dateFrom || toInputDate();
    const to = dateTo || dateFrom || toInputDate();
    const fromLabel = formatDate(parseInputDate(from));
    const toLabel = formatDate(parseInputDate(to));
    return from === to ? fromLabel : `${fromLabel} – ${toLabel}`;
  }, [dateFrom, dateTo]);

  const pageTitle = {
    dashboard: "Board",
    analytics: "Analytics",
    capture: editingId ? "Edit log" : "New log",
    logs: "Work logs",
    projects: "Projects",
    scratch: "Scratch paper",
  }[page];

  const pageSub = {
    dashboard: "Open logs and recent activity",
    analytics: "Charts for the logs in a date range",
    capture:
      "Paste a daily accomplishment and the logs are created on that date",
    logs: `Browsing ${activeDateLabel}`,
    projects: "Group your logs and notes by project / repo",
    scratch: "Dump thoughts here — organized, no save",
  }[page];

  function goPage(next: Page) {
    setPage(next);
  }

  function goLogsToday() {
    const today = toInputDate();
    setDateFrom(today);
    setDateTo(today);
    goPage("logs");
  }

  function goAllLogs() {
    setDateFrom("");
    setDateTo("");
    setQuery("");
    setTypeFilter("");
    setProjectFilter("");
    goPage("logs");
  }

  function onDateFromChange(value: string) {
    setDateFrom(value);
    if (value && dateTo && value > dateTo) setDateTo(value);
  }

  function onDateToChange(value: string) {
    setDateTo(value);
    if (value && dateFrom && value < dateFrom) setDateFrom(value);
  }

  async function exportNotepad(range?: { from: string; to: string }) {
    const fromValue = range?.from || dateFrom || dateTo || toInputDate();
    const toValue = range?.to || dateTo || dateFrom || toInputDate();

    try {
      const doneParams = new URLSearchParams({
        type: "TICKET",
        status: "DONE",
        dateField: "resolved_at",
        from: fromValue,
        to: toValue,
      });

      const doneRes = await apiFetch(`/api/entries?${doneParams}`);
      if (!doneRes.ok) {
        throw new Error("Failed to load logs for export");
      }

      const completedTickets = (await doneRes.json()) as Entry[];

      const text = buildDailyAccomplishmentText({
        name: exportName,
        date: parseInputDate(fromValue),
        dateEnd: parseInputDate(toValue),
        completedTickets: completedTickets.map(toExportEntry),
      });
      const filename =
        fromValue === toValue
          ? `daily-accomplishment-${fromValue}.txt`
          : `daily-accomplishment-${fromValue}_to_${toValue}.txt`;
      downloadTextFile(filename, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function exportConsolidated() {
    setPreparingReport(true);
    setError("");
    try {
      const doneParams = new URLSearchParams({
        type: "TICKET",
        status: "DONE",
        dateField: "resolved_at",
      });
      const doneRes = await apiFetch(`/api/entries?${doneParams}`);
      if (!doneRes.ok) {
        throw new Error("Failed to load logs for the consolidated report");
      }

      const completedTickets = (await doneRes.json()) as Entry[];
      const weeks = buildConsolidatedWeeks(
        completedTickets.map((entry) => ({
          projectName: entry.project?.name ?? null,
          title: entry.title,
          body: entry.body,
          at: entry.resolvedAt || entry.createdAt,
        }))
      );

      if (!weeks.length) {
        setError("No accomplishments to consolidate.");
        return;
      }

      setReportWeeks(weeks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consolidated export failed");
    } finally {
      setPreparingReport(false);
    }
  }

  async function exportChosenFormat(format: ReportFormat) {
    if (!reportWeeks?.length) return;
    const name = exportName.trim() || session?.user?.name?.trim() || "";
    const fromValue = toInputDate(reportWeeks[0].start);
    const toValue = toInputDate(reportWeeks[reportWeeks.length - 1].end);
    const filename =
      fromValue === toValue
        ? `consolidated-${fromValue}.docx`
        : `consolidated-${fromValue}_to_${toValue}.docx`;
    await downloadConsolidatedDocx(filename, name, reportWeeks, format);
    setReportWeeks(null);
  }

  function exportTodayAccomplishment() {
    const today = toInputDate();
    return exportNotepad({ from: today, to: today });
  }

  function startEdit(entry: Entry) {
    setViewingEntry(null);
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      body: entry.body,
      type: entry.type,
      status: entry.status ?? "OPEN",
      tags: entry.tags || "",
      projectId: entry.projectId || "",
      loggedOn: entryLogDate(entry),
    });
    setPage("capture");
  }

  function openView(entry: Entry) {
    setViewingEntry(entry);
  }

  function closeView() {
    setViewingEntry(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(freshForm());
  }

  async function onImportAccomplishment(e: FormEvent) {
    e.preventDefault();
    setImporting(true);
    setError("");

    try {
      const res = await apiFetch("/api/entries/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not create logs");
      }

      const keptName =
        accomplishmentName(importText) || session?.user?.name?.trim() || "";
      const fromLabel = formatDate(parseInputDate(data.from));
      const toLabel = formatDate(parseInputDate(data.to));
      const when = data.from === data.to ? fromLabel : `${fromLabel} – ${toLabel}`;
      setImportNotice(
        `Created ${data.created} log${data.created === 1 ? "" : "s"} for ${when}.`
      );
      setImportText(accomplishmentTemplate(keptName));
      setDateFrom(data.from);
      setDateTo(data.to);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create logs");
    } finally {
      setImporting(false);
    }
  }

  async function onSaveEntry(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (isTicketType(form.type) && !form.projectId) {
      setError("Project is required for logs");
      setSaving(false);
      return;
    }

    if (form.loggedOn && form.loggedOn > toInputDate()) {
      setError("The accomplishment date cannot be in the future.");
      setSaving(false);
      return;
    }

    const kept = {
      title: form.title,
      type: form.type,
      status: form.status,
      projectId: form.projectId,
      loggedOn: form.loggedOn,
    };

    try {
      const payload = {
        title: form.title,
        body: form.body,
        type: form.type,
        tags: form.tags,
        projectId: form.projectId || null,
        loggedOn: form.loggedOn,
        ...(isTicketType(form.type) ? { status: form.status } : {}),
      };

      const res = await apiFetch(
        editingId ? `/api/entries/${editingId}` : "/api/entries",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save entry");
      }

      setForm({
        ...emptyForm,
        title: kept.title,
        type: kept.type,
        status: kept.status,
        projectId: kept.projectId,
        loggedOn: kept.loggedOn || toInputDate(),
      });
      setEditingId(null);
      await loadEntries();
      await loadProjects();
      await loadAlerts();
      await loadDoneToday();
      if (isTicketType(kept.type) && kept.loggedOn === toInputDate()) {
        goPage("dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    setError("");
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create project");
      }
      setProjectName("");
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project create failed");
    }
  }

  async function setTicketStatus(entry: Entry, status: TicketStatus) {
    const res = await apiFetch(`/api/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Entry;
      if (viewingEntry?.id === entry.id) setViewingEntry(updated);
      await loadEntries();
      await loadAlerts();
      await loadDoneToday();
    }
  }

  async function removeEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    const res = await apiFetch(`/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadEntries();
      await loadAlerts();
      await loadDoneToday();
      if (viewingEntry?.id === id) closeView();
    }
  }

  async function removeProject(id: string) {
    if (!confirm("Delete this project? Entries stay, but become unassigned."))
      return;
    const res = await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadProjects();
      await loadEntries();
    }
  }

  async function copyBody(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function ticketStatusActions(entry: Entry) {
    if (!isTicketType(entry.type)) return null;
    const status = entry.status ?? "OPEN";
    return (
      <>
        {status === "OPEN" ? (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setTicketStatus(entry, "IN_PROGRESS")}
          >
            Start
          </button>
        ) : null}
        {status === "IN_PROGRESS" ? (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setTicketStatus(entry, "OPEN")}
          >
            Reopen
          </button>
        ) : null}
        {status !== "DONE" ? (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setTicketStatus(entry, "DONE")}
          >
            Mark done
          </button>
        ) : (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setTicketStatus(entry, "OPEN")}
          >
            Reopen
          </button>
        )}
      </>
    );
  }

  function renderEntryCard(entry: Entry) {
    const meta = typeMeta(entry.type);
    const tags = parseTags(entry.tags);
    const code = isCodeType(entry.type);
    const ticketDone = isTicketType(entry.type) && entry.status === "DONE";
    const statusLabel = statusMeta(entry.status)?.label;
    return (
      <article
        key={entry.id}
        className={`entry-card${code ? " is-code" : ""}${
          ticketDone ? " done" : ""
        }`}
        style={{ ["--chip" as string]: meta.color }}
      >
        <div className="entry-head">
          <button
            type="button"
            className="entry-title-btn"
            onClick={() => openView(entry)}
          >
            <h3 className="entry-title">{entry.title}</h3>
          </button>
          <span className="muted">
            {formatDate(entry.createdAt)} · {formatTime(entry.createdAt)}
          </span>
        </div>
        <div className="meta">
          <span
            className="chip chip--type"
            style={{ ["--chip" as string]: meta.color }}
          >
            {meta.label}
          </span>
          {statusLabel ? (
            <span className={statusChipClass(entry.status)}>{statusLabel}</span>
          ) : null}
          {entry.project ? (
            <span className="chip">{entry.project.name}</span>
          ) : null}
          {tags.map((tag) => (
            <span key={tag} className="chip">
              #{tag}
            </span>
          ))}
        </div>
        <div className={`entry-body${code ? " code" : ""}`}>{entry.body}</div>
        <div className="btn-row">
          <button className="btn" type="button" onClick={() => openView(entry)}>
            View
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => startEdit(entry)}
          >
            Edit
          </button>
          {code ? (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => copyBody(entry.body)}
            >
              Copy
            </button>
          ) : null}
          {ticketStatusActions(entry)}
          <button
            className="btn btn--danger"
            type="button"
            onClick={() => removeEntry(entry.id)}
          >
            Delete
          </button>
        </div>
      </article>
    );
  }

  function captureForm() {
    const ticket = isTicketType(form.type);
    return (
      <form
        onSubmit={onSaveEntry}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          const target = e.target as HTMLElement;
          if (target.tagName === "TEXTAREA") {
            if (e.shiftKey) return;
            e.preventDefault();
            if (!saving) e.currentTarget.requestSubmit();
            return;
          }
          if (target.tagName === "INPUT") {
            e.preventDefault();
            if (!saving) e.currentTarget.requestSubmit();
          }
        }}
      >
        <p className="muted">
          Tip: Enter saves · Shift+Enter new line · Type, title, project, and
          date stay after save so you can add the rest of that day.
        </p>
        <div className={ticket ? "row" : ""}>
          <div className="field">
            <label htmlFor="loggedOn">Accomplishment date</label>
            <input
              id="loggedOn"
              type="date"
              max={toInputDate()}
              value={form.loggedOn}
              onChange={(e) =>
                setForm((f) => ({ ...f, loggedOn: e.target.value }))
              }
              required
            />
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Pick the day this work belongs to. A past date, such as 10 Aug
              2026, files the log on that day. Set status to Done and it is
              included when you export that daily accomplishment.
            </p>
          </div>
          {ticket ? (
            <div className="field">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as TicketStatus,
                  }))
                }
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                Done on the accomplishment date is what the export lists under
                Tasks Completed.
              </p>
              {form.status !== "DONE" ? (
                <button
                  className="btn btn--ghost"
                  type="button"
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                  onClick={() => setForm((f) => ({ ...f, status: "DONE" }))}
                >
                  {form.loggedOn === toInputDate()
                    ? "Mark as done today"
                    : "Mark as done on this date"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as EntryType,
                }))
              }
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="project">
              Project{ticket ? " *" : ""}
            </label>
            <select
              id="project"
              value={form.projectId}
              onChange={(e) =>
                setForm((f) => ({ ...f, projectId: e.target.value }))
              }
              required={ticket}
            >
              <option value="">
                {ticket ? "Select project..." : "No project"}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={
              ticket ? "Fix auth middleware" : "Auth middleware fixed"
            }
            required
          />
        </div>

        <div className="field">
          <label htmlFor="body">
            {isCodeType(form.type)
              ? "Code / SQL"
              : ticket
                ? "Features / work items"
                : "Notes"}
          </label>
          <textarea
            id="body"
            className={isCodeType(form.type) ? "code-input" : ""}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder={
              isCodeType(form.type)
                ? "Paste SQL or snippet..."
                : ticket
                  ? "- Add login rate limit\n- Fix session cookie flags\n- Update tests"
                  : "What you finished or learned..."
            }
            required
          />
        </div>

        <div className="field">
          <label htmlFor="tags">Tags (comma separated)</label>
          <input
            id="tags"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="auth, mysql, nextjs"
          />
        </div>

        <div className="btn-row">
          <button className="btn" type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : editingId
                ? ticket
                  ? "Update log"
                  : "Update entry"
                : ticket
                  ? "Save log"
                  : "Save entry"}
          </button>
          {editingId ? (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <AdminFrame
      widgetMode={widgetMode}
      page={page}
      title={pageTitle}
      email={session?.user?.email}
      openCount={openTickets.length}
      onNavigate={(next) => {
        if (next === "logs") goLogsToday();
        else goPage(next);
      }}
      onSearch={(value) => {
        setQuery(value);
        setDateFrom("");
        setDateTo("");
        setTypeFilter("");
        setProjectFilter("");
        goPage("logs");
      }}
      onSignOut={() => signOut({ callbackUrl: "/login" })}
    >
        {error ? <div className="error">{error}</div> : null}
        {unassigned.projects + unassigned.entries > 0 ? (
          <div className="claim-banner">
            <p>
              {unassigned.entries} logs and {unassigned.projects} projects were
              saved before accounts existed. They are hidden until you attach
              them to this account.
            </p>
            <button
              type="button"
              className="btn btn--tiny"
              disabled={claiming}
              onClick={async () => {
                setClaiming(true);
                setError("");
                try {
                  const res = await apiFetch("/api/account/unassigned", {
                    method: "POST",
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || "Could not attach the old logs");
                    return;
                  }
                  await refresh();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not attach the old logs"
                  );
                } finally {
                  setClaiming(false);
                }
              }}
            >
              {claiming ? "Attaching…" : "Add them to my account"}
            </button>
          </div>
        ) : null}

        {page === "dashboard" ? (
          <div className="workly">
            <section className="workly-card workly-new">
              <div className="workly-art">
                <button
                  type="button"
                  className="workly-tile"
                  onClick={goLogsToday}
                >
                  <span>Today</span>
                  <strong>
                    {new Date().toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>
                  <em>
                    {doneToday.length} finished
                  </em>
                </button>
                <button
                  type="button"
                  className="workly-tile"
                  onClick={() =>
                    nextOpen ? openView(nextOpen) : goPage("capture")
                  }
                >
                  <span>Open</span>
                  <strong>{nextOpen?.title || "No open log"}</strong>
                </button>
                <button
                  type="button"
                  className="workly-tile"
                  onClick={() =>
                    latestDone ? openView(latestDone) : goLogsToday()
                  }
                >
                  <span>Done</span>
                  <strong>{latestDone?.title || "Nothing yet"}</strong>
                </button>
              </div>
              <h2>New log</h2>
              <p>
                File the work for a project. Done logs land in today&apos;s
                accomplishment.
              </p>
              <div className="workly-stats">
                <div>
                  <b>{openTickets.length}</b>
                  <span>Open</span>
                </div>
                <div>
                  <b>{inProgressCount}</b>
                  <span>Active</span>
                </div>
                <div>
                  <b>{doneToday.length}</b>
                  <span>Done</span>
                </div>
                <div>
                  <b>{projects.length}</b>
                  <span>Projects</span>
                </div>
              </div>
              <div className="workly-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => goPage("capture")}
                >
                  + New log
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={goLogsToday}
                >
                  Logs
                </button>
              </div>
            </section>
            <div className="workly-stack">
              <section className="workly-card workly-mini">
                <p className="muted">Last 7 days</p>
                <h3>{entries.length} logs</h3>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => goPage("analytics")}
                >
                  Analytics
                </button>
              </section>
              <section className="workly-card workly-mini">
                <p className="muted">Scratch paper</p>
                <h3>Quick notes</h3>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => goPage("scratch")}
                >
                  Open
                </button>
              </section>
            </div>

            <section className="workly-card workly-tasks">
              <div className="section-head">
                <h2>Open logs</h2>
                <span className="muted">{openTickets.length} total</span>
              </div>
              {openTickets.length === 0 ? (
                <p className="empty">No open logs. Add one to start the board.</p>
              ) : (
                <div className="ticket-list">
                  {openTickets.map((entry) => (
                    <div
                      key={entry.id}
                      className="ticket-row"
                      data-status={entry.status || "OPEN"}
                    >
                      <button
                        type="button"
                        className="ticket-row__main"
                        onClick={() => openView(entry)}
                      >
                        <strong>{entry.title}</strong>
                        <p>{entry.body}</p>
                        <div className="meta">
                          {entry.project ? (
                            <span className="chip">{entry.project.name}</span>
                          ) : null}
                          <span className={statusChipClass(entry.status)}>
                            {statusMeta(entry.status)?.label || "Open"}
                          </span>
                        </div>
                      </button>
                      <div className="ticket-row__actions">
                        {ticketStatusActions(entry)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="workly-card workly-done">
              <div className="section-head">
                <h2>Done today</h2>
                <button
                  className="btn"
                  type="button"
                  onClick={exportTodayAccomplishment}
                  disabled={loading || doneToday.length === 0}
                >
                  Export
                </button>
              </div>
              {loading ? (
                <p className="empty">Loading...</p>
              ) : doneToday.length === 0 ? (
                <p className="empty">Nothing finished today yet.</p>
              ) : (
                <div className="entry-list">
                  {doneToday.map(renderEntryCard)}
                </div>
              )}
            </section>

            <section className="workly-card workly-side">
              <div className="section-head">
                <h2>Projects</h2>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => goPage("projects")}
                >
                  All
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="empty">No projects yet.</p>
              ) : (
                <ul className="workly-people">
                  {projects.slice(0, 6).map((project) => (
                    <li key={project.id}>
                      <span className="desk-avatar">
                        {project.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{project.name}</span>
                      <span className="muted">
                        {project._count?.entries ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="btn"
                type="button"
                onClick={() => goPage("projects")}
              >
                + Project
              </button>
            </section>

            <section className="workly-card workly-recent">
              <div className="section-head">
                <h2>Recent logs</h2>
                <span className="muted">{entries.length} in 7 days</span>
              </div>
              {entries.length === 0 ? (
                <p className="empty">No logs in the last 7 days.</p>
              ) : (
                <div className="workly-table-wrap">
                  <table className="workly-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Title</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.slice(0, 8).map((entry) => (
                        <tr key={entry.id} onClick={() => openView(entry)}>
                          <td>{entry.project?.name || "No project"}</td>
                          <td>{entry.title}</td>
                          <td>{formatDate(entry.createdAt)}</td>
                          <td>
                            {entry.status ? (
                              <span className={statusChipClass(entry.status)}>
                                {statusMeta(entry.status)?.label || "Open"}
                              </span>
                            ) : (
                              <span className="chip">
                                {typeMeta(entry.type).label}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="workly-card workly-perf">
              <div className="section-head">
                <h2>This week</h2>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => goPage("analytics")}
                >
                  Charts
                </button>
              </div>
              <svg
                className="workly-chart"
                viewBox="0 0 260 120"
                role="img"
                aria-label="Logs over the last 7 days"
              >
                <polyline
                  points={weekPoints
                    .map((point, index) => {
                      const max = Math.max(
                        1,
                        ...weekPoints.map((item) => item.count)
                      );
                      const x = (index / 6) * 250 + 5;
                      const y = 108 - (point.count / max) * 90;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
              <div className="workly-legend">
                {weekPoints.map((point) => (
                  <span key={point.key}>
                    {point.label} {point.count}
                  </span>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {page === "capture" ? (
          <>
            {!widgetMode ? (
              <header className="page-hero">
                <div className="page-hero-text">
                  <h2>{pageTitle}</h2>
                  <p className="muted">{pageSub}</p>
                </div>
              </header>
            ) : null}

            {!editingId ? (
              <section className="compose panel">
                <div className="section-head">
                  <h3>Paste accomplishment</h3>
                </div>
                <form onSubmit={onImportAccomplishment}>
                  <p className="muted">
                    The header is already filled in. Add the date, then paste
                    the tasks under Tasks Completed. Each task is created as
                    Done. A range such as Aug 10–15, 2026 files those tasks on
                    the first day, so opening that range brings the
                    accomplishment back.
                  </p>
                  {importNotice ? <p className="import-notice">{importNotice}</p> : null}
                  <div className="field">
                    <label htmlFor="accomplishment">Daily accomplishment</label>
                    <textarea
                      id="accomplishment"
                      className="import-input"
                      value={importText}
                      onChange={(e) => {
                        setImportNotice("");
                        setImportText(e.target.value);
                      }}
                    />
                  </div>
                  <div className="btn-row">
                    <button className="btn" type="submit" disabled={importing}>
                      {importing ? "Creating logs..." : "Create logs"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <section className="compose panel">
              <div className="section-head">
                <h3>{editingId ? "Edit" : "New log"}</h3>
              </div>
              {captureForm()}
            </section>

            <section className="section">
              <div className="section-head">
                <h3>Today</h3>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={goLogsToday}
                >
                  View all logs
                </button>
              </div>
              {loading ? (
                <p className="empty">Loading...</p>
              ) : todayEntries.length === 0 ? (
                <p className="empty">Nothing logged today yet.</p>
              ) : (
                <div className="entry-list">
                  {todayEntries.map(renderEntryCard)}
                </div>
              )}
            </section>
          </>
        ) : null}

        {page === "logs" ? (
          <>
            {!widgetMode ? (
              <header className="page-hero">
                <div className="page-hero-text">
                  <h2>{pageTitle}</h2>
                  <p className="muted">{pageSub}</p>
                </div>
                <div className="page-hero-actions">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={goLogsToday}
                  >
                    Today
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={goAllLogs}
                  >
                    All logs
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => exportNotepad()}
                    disabled={loading}
                  >
                    Export .txt
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={exportConsolidated}
                    disabled={loading || preparingReport}
                  >
                    {preparingReport ? "Opening..." : "Consolidated"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => goPage("capture")}
                  >
                    New log
                  </button>
                </div>
              </header>
            ) : null}

            <section className="section panel">
              <div className="section-head">
                <h3>Filter & export</h3>
                <span className="muted">{entries.length} entries</span>
              </div>
              <p className="muted">
                Consolidated opens a preview of all your done logs. Pick a
                format, then export the Word file. A week with no work is
                included in a neighboring week that has work.
              </p>
              {widgetMode ? (
                <div className="btn-row">
                  <button
                    className="btn"
                    type="button"
                    onClick={exportConsolidated}
                    disabled={loading || preparingReport}
                  >
                    {preparingReport ? "Opening..." : "Consolidated"}
                  </button>
                </div>
              ) : null}

              <div className="filters">
                <label className="field">
                  <span>From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Export name</span>
                  <input
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className="field">
                  <span>Search</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, body, tags"
                  />
                </label>
                <label className="field">
                  <span>Type</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="">All types</option>
                    {ENTRY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Project</span>
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {dateFrom || dateTo ? (
                  <div className="field">
                    <span aria-hidden="true">&nbsp;</span>
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={goAllLogs}
                    >
                      Clear dates
                    </button>
                  </div>
                ) : null}
              </div>

              {loading ? (
                <p className="empty">Loading...</p>
              ) : entries.length === 0 ? (
                <p className="empty">No entries in this range.</p>
              ) : (
                <div className="entry-list">
                  {entries.map(renderEntryCard)}
                </div>
              )}
            </section>
          </>
        ) : null}

        {page === "analytics" ? <AnalyticsView projects={projects} /> : null}

        {page === "projects" ? (
          <>
            {!widgetMode ? (
              <header className="page-hero">
                <div className="page-hero-text">
                  <h2>{pageTitle}</h2>
                  <p className="muted">{pageSub}</p>
                </div>
                <div className="page-hero-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => goPage("capture")}
                  >
                    New log
                  </button>
                </div>
              </header>
            ) : null}

            <section className="section panel">
              <div className="section-head">
                <h3>Add project</h3>
              </div>
              <form onSubmit={onCreateProject}>
                <div className="field">
                  <label htmlFor="projectName">Project name</label>
                  <input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="inventory-api"
                    required
                  />
                </div>
                <button className="btn" type="submit">
                  Add project
                </button>
              </form>
            </section>

            <section className="section panel">
              <div className="section-head">
                <h3>All projects</h3>
                <span className="muted">{projects.length} total</span>
              </div>
              {projects.length === 0 ? (
                <p className="empty">No projects yet.</p>
              ) : (
                projects.map((p) => (
                  <div key={p.id} className="ticket-row">
                    <div className="ticket-row__main">
                      <strong>{p.name}</strong>
                      <div className="muted">
                        {p._count?.entries ?? 0} entries
                      </div>
                    </div>
                    <div className="ticket-row__actions">
                      <button
                        className="btn btn--danger"
                        type="button"
                        onClick={() => removeProject(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        ) : null}

        {page === "scratch" ? (
          <>
            {!widgetMode ? (
              <header className="page-hero">
                <div className="page-hero-text">
                  <h2>{pageTitle}</h2>
                  <p className="muted">{pageSub}</p>
                </div>
              </header>
            ) : null}
            <ScratchPad key={session?.user?.id || "scratch"} />
          </>
        ) : null}

      {reportWeeks ? (
        <ConsolidatedFormatModal
          weeks={reportWeeks}
          personName={exportName.trim() || session?.user?.name?.trim() || ""}
          onClose={() => setReportWeeks(null)}
          onExport={exportChosenFormat}
        />
      ) : null}

      {viewingEntry ? (
        <div
          className="modal-backdrop"
          onClick={closeView}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-entry-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-head">
              <h3 id="view-entry-title">{viewingEntry.title}</h3>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={closeView}
              >
                Close
              </button>
            </div>

            <div className="meta">
              <span
                className="chip chip--type"
                style={{
                  ["--chip" as string]: typeMeta(viewingEntry.type).color,
                }}
              >
                {typeMeta(viewingEntry.type).label}
              </span>
              {statusMeta(viewingEntry.status) ? (
                <span className={statusChipClass(viewingEntry.status)}>
                  {statusMeta(viewingEntry.status)?.label}
                </span>
              ) : null}
              {viewingEntry.project ? (
                <span className="chip">{viewingEntry.project.name}</span>
              ) : null}
              {parseTags(viewingEntry.tags).map((tag) => (
                <span key={tag} className="chip">
                  #{tag}
                </span>
              ))}
            </div>

            <p className="muted meta">
              {formatDate(viewingEntry.createdAt)} ·{" "}
              {formatTime(viewingEntry.createdAt)}
              {viewingEntry.resolvedAt
                ? ` · Resolved ${formatDate(viewingEntry.resolvedAt)}`
                : ""}
            </p>

            <div
              className={`entry-body view-body${
                isCodeType(viewingEntry.type) ? " code" : ""
              }`}
            >
              {viewingEntry.body}
            </div>

            <div className="btn-row">
              <button
                className="btn"
                type="button"
                onClick={() => startEdit(viewingEntry)}
              >
                Edit
              </button>
              {ticketStatusActions(viewingEntry)}
              {isCodeType(viewingEntry.type) ? (
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => copyBody(viewingEntry.body)}
                >
                  Copy
                </button>
              ) : null}
              <button
                className="btn btn--ghost"
                type="button"
                onClick={closeView}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminFrame>
  );
}

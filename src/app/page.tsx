"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import ScratchPad from "@/components/ScratchPad";
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

type Page = "dashboard" | "capture" | "logs" | "projects" | "scratch";

const emptyForm = {
  title: "",
  body: "",
  type: DEFAULT_ENTRY_TYPE as EntryType,
  status: "OPEN" as TicketStatus,
  tags: "",
  projectId: "",
};

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

export default function HomePage() {
  const [widgetMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("widget");
  });
  const [page, setPage] = useState<Page>(() => {
    if (typeof window === "undefined") return "dashboard";
    const params = new URLSearchParams(window.location.search);
    const p = params.get("page");
    if (p && ["dashboard", "capture", "logs", "projects", "scratch"].includes(p)) {
      return p as Page;
    }
    return params.has("widget") ? "capture" : "dashboard";
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState(emptyForm);
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
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState<Entry[]>([]);
  const [doneToday, setDoneToday] = useState<Entry[]>([]);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error("Failed to load projects");
    setProjects(await res.json());
  }, []);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/entries?type=TICKET&status=open");
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
    const res = await fetch(`/api/entries?${params}`);
    if (!res.ok) return;
    setDoneToday(await res.json());
  }, []);

  const loadEntries = useCallback(async () => {
    if (page === "scratch") return;

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

    const res = await fetch(`/api/entries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load entries");
    setEntries(await res.json());
  }, [page, query, typeFilter, projectFilter, dateFrom, dateTo]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await Promise.all([
        loadProjects(),
        loadEntries(),
        loadAlerts(),
        loadDoneToday(),
      ]);
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

  const activeDateLabel = useMemo(() => {
    const from = dateFrom || toInputDate();
    const to = dateTo || dateFrom || toInputDate();
    const fromLabel = formatDate(parseInputDate(from));
    const toLabel = formatDate(parseInputDate(to));
    return from === to ? fromLabel : `${fromLabel} – ${toLabel}`;
  }, [dateFrom, dateTo]);

  const pageTitle = {
    dashboard: "Board",
    capture: editingId ? "Edit ticket" : "New ticket",
    logs: "Work logs",
    projects: "Projects",
    scratch: "Scratch paper",
  }[page];

  const pageSub = {
    dashboard: "Open tickets and recent activity",
    capture: "Submit a project ticket, then mark it done when shipped",
    logs: `Browsing ${activeDateLabel}`,
    projects: "Group your tickets and notes by project / repo",
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

      const doneRes = await fetch(`/api/entries?${doneParams}`);
      if (!doneRes.ok) {
        throw new Error("Failed to load tickets for export");
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
    setForm(emptyForm);
  }

  async function onSaveEntry(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (isTicketType(form.type) && !form.projectId) {
      setError("Project is required for tickets");
      setSaving(false);
      return;
    }

    const kept = {
      title: form.title,
      type: form.type,
      status: form.status,
      projectId: form.projectId,
    };

    try {
      const payload = {
        title: form.title,
        body: form.body,
        type: form.type,
        tags: form.tags,
        projectId: form.projectId || null,
        ...(isTicketType(form.type) ? { status: form.status } : {}),
      };

      const res = await fetch(
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
      });
      setEditingId(null);
      await loadEntries();
      await loadProjects();
      await loadAlerts();
      await loadDoneToday();
      if (isTicketType(kept.type)) {
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
      const res = await fetch("/api/projects", {
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
    const res = await fetch(`/api/entries/${entry.id}`, {
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
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
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
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
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
          Tip: Enter saves · Shift+Enter new line · Type/Title/Project stay after
          save
        </p>
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
              Choose <strong>Done</strong> for work already finished today — it
              goes into daily accomplishment.
            </p>
            {form.status !== "DONE" ? (
              <button
                className="btn btn--ghost"
                type="button"
                style={{ marginTop: 8, alignSelf: "flex-start" }}
                onClick={() => setForm((f) => ({ ...f, status: "DONE" }))}
              >
                Mark as done today
              </button>
            ) : null}
          </div>
        ) : null}

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
                  ? "Update ticket"
                  : "Update entry"
                : ticket
                  ? "Submit ticket"
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

  function mastLink(target: Page, label: string) {
    const active = page === target;
    return (
      <button
        type="button"
        className={`mast-link${active ? " mast-link--active" : ""}`}
        onClick={() => {
          if (target === "logs") goLogsToday();
          else goPage(target);
        }}
      >
        {label}
      </button>
    );
  }

  function dockItem(
    target: Page,
    label: string,
    opts?: { raised?: boolean; onClick?: () => void }
  ) {
    const active = page === target;
    return (
      <button
        type="button"
        className={`dock-item${active ? " dock-item--active" : ""}${
          opts?.raised ? " dock-item--new" : ""
        }`}
        onClick={opts?.onClick ?? (() => goPage(target))}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`shell${widgetMode ? " shell--widget" : ""}`}>
      {!widgetMode ? (
        <header className="masthead">
          <button
            type="button"
            className="masthead-brand"
            onClick={() => goPage("dashboard")}
          >
            <span className="masthead-mark" aria-hidden>
              &lt;/&gt;
            </span>
            <span>
              <strong>DevLog</strong>
              <span>Ticket board</span>
            </span>
          </button>

          <nav className="masthead-nav" aria-label="Primary">
            {mastLink("dashboard", "Board")}
            {mastLink("capture", "New")}
            {mastLink("logs", "Logs")}
            {mastLink("scratch", "Scratch")}
            {mastLink("projects", "Projects")}
          </nav>

          <div className="mast-meta">
            <em>{openTickets.length}</em> open
          </div>
        </header>
      ) : null}

      {widgetMode ? (
        <nav className="widget-nav">
          {(
            ["capture", "logs", "scratch", "dashboard", "projects"] as Page[]
          ).map((p) => (
            <button
              key={p}
              type="button"
              className={`widget-nav-btn${page === p ? " active" : ""}`}
              onClick={() => setPage(p)}
            >
              {p === "capture"
                ? "＋"
                : p === "logs"
                  ? "☰"
                  : p === "scratch"
                    ? "✎"
                    : p === "dashboard"
                      ? "◈"
                      : "▣"}
            </button>
          ))}
        </nav>
      ) : null}

      <main className="stage">
        {error ? <div className="error">{error}</div> : null}

        {page === "dashboard" ? (
          <>
            <header className="page-hero">
              <div className="page-hero-text">
                <h1>Board</h1>
                <p>
                  Mark tickets Done when you finish — those feed today&apos;s
                  daily accomplishment.
                </p>
              </div>
              <div className="page-hero-actions">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={exportTodayAccomplishment}
                  disabled={loading || doneToday.length === 0}
                >
                  Export today
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => goPage("capture")}
                >
                  New ticket
                </button>
              </div>
            </header>

            <div className="metric-row">
              <div className="metric">
                <b>{doneToday.length}</b>
                <span>Done today</span>
              </div>
              <div className="metric">
                <b>{openTickets.length}</b>
                <span>Open · {inProgressCount} active</span>
              </div>
              <div className="metric">
                <b>{entries.length}</b>
                <span>7 days</span>
              </div>
              <div className="metric">
                <b>{projects.length}</b>
                <span>Projects</span>
              </div>
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Done today</h2>
                <span className="muted">
                  {doneToday.length} ticket
                  {doneToday.length === 1 ? "" : "s"} → daily accomplishment
                </span>
              </div>
              {loading ? (
                <p className="empty">Loading...</p>
              ) : doneToday.length === 0 ? (
                <p className="empty">
                  No done tickets today yet. Finish an open ticket or submit one
                  with status Done.
                </p>
              ) : (
                <div className="entry-list">
                  {doneToday.map(renderEntryCard)}
                </div>
              )}
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Open tickets</h2>
                <span className="muted">{openTickets.length} total</span>
              </div>
              {openTickets.length === 0 ? (
                <p className="empty">No open tickets. Tap New to submit one.</p>
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
                          ) : (
                            <span className="chip">No project</span>
                          )}
                          <span className={statusChipClass(entry.status)}>
                            {statusMeta(entry.status)?.label || "Open"}
                          </span>
                        </div>
                      </button>
                      <div className="ticket-row__actions">
                        {ticketStatusActions(entry)}
                        <button
                          className="btn btn--ghost"
                          type="button"
                          onClick={() => openView(entry)}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
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

            <section className="compose panel">
              <div className="section-head">
                <h3>{editingId ? "Edit" : "Submit ticket"}</h3>
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
                    onClick={() => goPage("capture")}
                  >
                    New ticket
                  </button>
                </div>
              </header>
            ) : null}

            <section className="section panel">
              <div className="section-head">
                <h3>Filter & export</h3>
                <span className="muted">{entries.length} entries</span>
              </div>

              <div className="filters">
                <label className="field">
                  <span className="muted">From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                    aria-label="From date"
                  />
                </label>
                <label className="field">
                  <span className="muted">To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                    aria-label="To date"
                  />
                </label>
                <input
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  placeholder="Name for export"
                  aria-label="Name for export"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, body, tags..."
                />
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
                {dateFrom || dateTo ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={goAllLogs}
                  >
                    Clear dates
                  </button>
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
                    New ticket
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
            <ScratchPad />
          </>
        ) : null}
      </main>

      {!widgetMode ? (
        <nav className="dock" aria-label="Primary">
          {dockItem("dashboard", "Board")}
          {dockItem("logs", "Logs", { onClick: goLogsToday })}
          {dockItem("capture", "New", { raised: true })}
          {dockItem("scratch", "Scratch")}
          {dockItem("projects", "More")}
        </nav>
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
    </div>
  );
}

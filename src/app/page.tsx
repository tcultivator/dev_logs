"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ENTRY_TYPES,
  EntryType,
  formatDate,
  formatTime,
  isCodeType,
  parseTags,
  typeMeta,
} from "@/lib/entries";
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
  projectId: string | null;
  createdAt: string;
  project: Project | null;
};

type View = "today" | "all" | "projects";

const emptyForm = {
  title: "",
  body: "",
  type: "PROGRESS" as EntryType,
  tags: "",
  projectId: "",
};

export default function HomePage() {
  const [view, setView] = useState<View>("today");
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
  const [dateFilter, setDateFilter] = useState(() => toInputDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error("Failed to load projects");
    setProjects(await res.json());
  }, []);

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams();

    if (view === "today") {
      params.set("date", dateFilter || toInputDate());
    } else if (dateFilter) {
      params.set("date", dateFilter);
    }

    if (query.trim()) params.set("q", query.trim());
    if (typeFilter) params.set("type", typeFilter);
    if (projectFilter) params.set("projectId", projectFilter);

    const res = await fetch(`/api/entries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load entries");
    setEntries(await res.json());
  }, [view, query, typeFilter, projectFilter, dateFilter]);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await Promise.all([loadProjects(), loadEntries()]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach the API. Is MySQL running and .env set?"
      );
    } finally {
      setLoading(false);
    }
  }, [loadProjects, loadEntries]);

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

  const activeDateLabel = useMemo(() => {
    const value = dateFilter || toInputDate();
    return formatDate(parseInputDate(value));
  }, [dateFilter]);

  function goToday() {
    setDateFilter(toInputDate());
    setView("today");
  }

  function exportNotepad() {
    const dateValue = dateFilter || toInputDate();
    const text = buildDailyAccomplishmentText({
      name: exportName,
      date: parseInputDate(dateValue),
      entries: entries.map((entry) => ({
        title: entry.title,
        body: entry.body,
        type: entry.type,
        done: entry.done,
        projectName: entry.project?.name ?? null,
      })),
    });
    const filename = `daily-accomplishment-${dateValue}.txt`;
    downloadTextFile(filename, text);
  }

  function startEdit(entry: Entry) {
    setViewingEntry(null);
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      body: entry.body,
      type: entry.type,
      tags: entry.tags || "",
      projectId: entry.projectId || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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

    const kept = {
      title: form.title,
      type: form.type,
      projectId: form.projectId,
    };
    const wasEditing = Boolean(editingId);

    try {
      const payload = {
        ...form,
        projectId: form.projectId || null,
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
        projectId: kept.projectId,
      });
      setEditingId(null);
      await loadEntries();
      await loadProjects();
      if (!wasEditing) goToday();
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

  async function toggleDone(entry: Entry) {
    const res = await fetch(`/api/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !entry.done }),
    });
    if (res.ok) await loadEntries();
  }

  async function removeEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) await loadEntries();
  }

  async function removeProject(id: string) {
    if (!confirm("Delete this project? Entries stay, but become unassigned.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadProjects();
      await loadEntries();
    }
  }

  async function copyBody(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">Dev Log</h1>
          <p className="brand-sub">
            Daily notes, SQL, and snippets — {activeDateLabel}
          </p>
        </div>
        <nav className="nav">
          <button
            className={view === "today" ? "active" : ""}
            onClick={goToday}
            type="button"
          >
            Today
          </button>
          <button
            className={view === "all" ? "active" : ""}
            onClick={() => {
              setDateFilter("");
              setView("all");
            }}
            type="button"
          >
            All / Search
          </button>
          <button
            className={view === "projects" ? "active" : ""}
            onClick={() => setView("projects")}
            type="button"
          >
            Projects
          </button>
        </nav>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="layout">
        <section className="panel">
          <h2>{editingId ? "Edit entry" : "Quick capture"}</h2>
          <form
            onSubmit={onSaveEntry}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;

              const target = e.target as HTMLElement;

              // In notes: Enter saves, Shift+Enter adds a new line
              if (target.tagName === "TEXTAREA") {
                if (e.shiftKey) return;
                e.preventDefault();
                if (!saving) e.currentTarget.requestSubmit();
                return;
              }

              // In text inputs: Enter saves (skip if it's a button already handling it)
              if (target.tagName === "INPUT") {
                e.preventDefault();
                if (!saving) e.currentTarget.requestSubmit();
              }
            }}
          >
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
                <label htmlFor="project">Project</label>
                <select
                  id="project"
                  value={form.projectId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, projectId: e.target.value }))
                  }
                >
                  <option value="">No project</option>
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Auth middleware fixed"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="body">
                {isCodeType(form.type) ? "Code / SQL" : "Notes"}
              </label>
              <textarea
                id="body"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                placeholder={
                  isCodeType(form.type)
                    ? "Paste SQL or snippet here... (Enter to save, Shift+Enter for new line)"
                    : "What happened... (Enter to save, Shift+Enter for new line)"
                }
                required
              />
            </div>

            <div className="field">
              <label htmlFor="tags">Tags (comma separated)</label>
              <input
                id="tags"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="auth, mysql, nextjs"
              />
            </div>

            <div className="btn-row">
              <button className="btn" type="submit" disabled={saving}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update entry"
                    : "Save entry"}
              </button>
              {editingId ? (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel">
          {view === "projects" ? (
            <>
              <h2>Projects</h2>
              <form onSubmit={onCreateProject}>
                <div className="field">
                  <label htmlFor="projectName">New project</label>
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
              <div className="project-list">
                {projects.length === 0 ? (
                  <p className="empty">No projects yet.</p>
                ) : (
                  projects.map((p) => (
                    <div key={p.id} className="project-item">
                      <div>
                        <strong>{p.name}</strong>
                        <div className="muted">
                          {p._count?.entries ?? 0} entries
                        </div>
                      </div>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => removeProject(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="panel-head">
                <h2>{view === "today" ? "Today" : "All entries"}</h2>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={exportNotepad}
                  disabled={loading}
                >
                  Export .txt
                </button>
              </div>

              <div className="filters">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value);
                    if (e.target.value) setView("today");
                  }}
                  aria-label="Filter by date"
                />
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
                {view === "all" ? (
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setDateFilter("")}
                  >
                    Clear date
                  </button>
                ) : null}
              </div>

              {loading ? (
                <p className="empty">Loading...</p>
              ) : entries.length === 0 ? (
                <p className="empty">
                  No entries yet. Capture something on the left.
                </p>
              ) : (
                <div className="entry-list">
                  {entries.map((entry) => {
                    const meta = typeMeta(entry.type);
                    const tags = parseTags(entry.tags);
                    const code = isCodeType(entry.type);
                    return (
                      <article
                        key={entry.id}
                        className={`entry-card${entry.done ? " done" : ""}`}
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
                            {formatTime(entry.createdAt)}
                          </span>
                        </div>
                        <div className="meta">
                          <span
                            className="chip type"
                            style={{ background: meta.color }}
                          >
                            {meta.label}
                          </span>
                          {entry.project ? (
                            <span className="chip">{entry.project.name}</span>
                          ) : null}
                          {tags.map((tag) => (
                            <span key={tag} className="chip">
                              #{tag}
                            </span>
                          ))}
                        </div>
                        <div className={`entry-body${code ? " code" : ""}`}>
                          {entry.body}
                        </div>
                        <div className="btn-row">
                          <button
                            className="btn"
                            type="button"
                            onClick={() => openView(entry)}
                          >
                            View
                          </button>
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => startEdit(entry)}
                          >
                            Edit
                          </button>
                          {code ? (
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => copyBody(entry.body)}
                            >
                              Copy
                            </button>
                          ) : null}
                          {(entry.type === "TODO" ||
                            entry.type === "REMINDER") && (
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => toggleDone(entry)}
                            >
                              {entry.done ? "Mark open" : "Mark done"}
                            </button>
                          )}
                          <button
                            className="btn danger"
                            type="button"
                            onClick={() => removeEntry(entry.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

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
            <div className="panel-head">
              <h2 id="view-entry-title">{viewingEntry.title}</h2>
              <button
                className="btn secondary"
                type="button"
                onClick={closeView}
              >
                Close
              </button>
            </div>

            <div className="meta">
              <span
                className="chip type"
                style={{ background: typeMeta(viewingEntry.type).color }}
              >
                {typeMeta(viewingEntry.type).label}
              </span>
              {viewingEntry.project ? (
                <span className="chip">{viewingEntry.project.name}</span>
              ) : null}
              {parseTags(viewingEntry.tags).map((tag) => (
                <span key={tag} className="chip">
                  #{tag}
                </span>
              ))}
              {viewingEntry.done ? (
                <span className="chip">Done</span>
              ) : null}
            </div>

            <p className="muted view-meta">
              {formatDate(viewingEntry.createdAt)} ·{" "}
              {formatTime(viewingEntry.createdAt)}
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
              {isCodeType(viewingEntry.type) ? (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => copyBody(viewingEntry.body)}
                >
                  Copy
                </button>
              ) : null}
              <button
                className="btn secondary"
                type="button"
                onClick={closeView}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

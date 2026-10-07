"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ENTRY_TYPES,
  EntryType,
  TICKET_STATUSES,
  TicketStatus,
  isTicketType,
} from "@/lib/entries";
import { parseInputDate, toInputDate } from "@/lib/export";

type Project = {
  id: string;
  name: string;
};

type Entry = {
  id: string;
  type: EntryType;
  status: TicketStatus | null;
  createdAt: string;
  project: { id: string; name: string } | null;
};

const PRESETS = [
  { id: "7", days: 7, label: "7 days" },
  { id: "30", days: 30, label: "30 days" },
  { id: "90", days: 90, label: "90 days" },
];

const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: "#f15a24",
  IN_PROGRESS: "#6f8cff",
  DONE: "#15803d",
};

function daysAgoInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toInputDate(date);
}

function eachDay(from: string, to: string) {
  const start = parseInputDate(from);
  const end = parseInputDate(to);
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && days.length < 400) {
    days.push(toInputDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function weekStart(iso: string) {
  const date = parseInputDate(iso);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return toInputDate(date);
}

function shortLabel(iso: string) {
  const date = parseInputDate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildSeries(entries: Entry[], from: string, to: string) {
  const days = eachDay(from, to);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = toInputDate(new Date(entry.createdAt));
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (days.length <= 42) {
    return {
      weekly: false,
      points: days.map((day) => ({
        key: day,
        label: shortLabel(day),
        value: counts.get(day) || 0,
      })),
    };
  }

  const weeks = new Map<string, number>();
  for (const day of days) {
    const week = weekStart(day);
    weeks.set(week, (weeks.get(week) || 0) + (counts.get(day) || 0));
  }
  return {
    weekly: true,
    points: [...weeks.entries()].map(([key, value]) => ({
      key,
      label: shortLabel(key),
      value,
    })),
  };
}

function ColumnChart({
  points,
}: {
  points: { key: string; label: string; value: number }[];
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = Math.max(1, Math.ceil(points.length / 6));
  return (
    <div>
      <div className="columns" role="img" aria-label="Logs over time">
        {points.map((point) => (
          <div key={point.key} className="column" title={`${point.label}: ${point.value}`}>
            <div
              className="column-bar"
              style={{
                height:
                  point.value === 0
                    ? "0%"
                    : `${Math.max(8, (point.value / max) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="column-axis">
        {points.map((point, index) => {
          const show =
            index === 0 ||
            index === points.length - 1 ||
            index % step === 0;
          return <span key={point.key}>{show ? point.label : ""}</span>;
        })}
      </div>
    </div>
  );
}

function BarList({
  rows,
}: {
  rows: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bar-list">
      {rows.map((row) => (
        <div key={row.label} className="bar-row">
          <span className="bar-label">{row.label}</span>
          <div className="bar-track" aria-hidden>
            <div
              className="bar-fill"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: row.color,
              }}
            />
          </div>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsView({ projects }: { projects: Project[] }) {
  const [preset, setPreset] = useState("30");
  const [from, setFrom] = useState(() => daysAgoInput(29));
  const [to, setTo] = useState(() => toInputDate());
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ from, to });
        if (projectId) params.set("projectId", projectId);
        if (type) params.set("type", type);
        const res = await fetch(`/api/entries?${params}`);
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (res.status === 403) {
          window.location.assign("/set-password");
          return;
        }
        if (!res.ok) throw new Error("Failed to load analytics");
        const data = (await res.json()) as Entry[];
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load analytics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [from, to, projectId, type]);

  const series = useMemo(() => buildSeries(entries, from, to), [entries, from, to]);

  const typeRows = useMemo(
    () =>
      ENTRY_TYPES.map((item) => ({
        label: item.label,
        value: entries.filter((entry) => entry.type === item.value).length,
        color: item.color,
      })),
    [entries]
  );

  const statusRows = useMemo(() => {
    const tickets = entries.filter((entry) => isTicketType(entry.type));
    return TICKET_STATUSES.map((item) => ({
      label: item.label,
      value: tickets.filter((entry) => (entry.status || "OPEN") === item.value).length,
      color: STATUS_COLOR[item.value],
    }));
  }, [entries]);

  const projectRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const name = entry.project?.name || "No project";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((sum, [, count]) => sum + count, 0);
    const rows = top.map(([label, value], index) => ({
      label,
      value,
      color: index === 0 ? "#c01020" : "#344054",
    }));
    if (rest > 0) rows.push({ label: "Other", value: rest, color: "#98a2b3" });
    return rows;
  }, [entries]);

  const ticketCount = entries.filter((entry) => isTicketType(entry.type)).length;
  const doneCount = statusRows.find((row) => row.label === "Done")?.value ?? 0;
  const openCount = statusRows
    .filter((row) => row.label !== "Done")
    .reduce((sum, row) => sum + row.value, 0);
  const activeDays = series.points.filter((point) => point.value > 0).length;
  const peak = series.points.reduce(
    (best, point) => (point.value > best.value ? point : best),
    series.points[0] || { label: "—", value: 0, key: "" }
  );

  function applyPreset(id: string, days: number) {
    setPreset(id);
    setFrom(daysAgoInput(days - 1));
    setTo(toInputDate());
  }

  function onFrom(value: string) {
    setPreset("custom");
    setFrom(value);
    if (value && to && value > to) setTo(value);
  }

  function onTo(value: string) {
    setPreset("custom");
    setTo(value);
    if (value && from && value < from) setFrom(value);
  }

  return (
    <>
      <header className="page-hero">
        <div className="page-hero-text">
          <h1>Analytics</h1>
          <p>Logs created in the selected range, split by day, type, status, and project.</p>
        </div>
      </header>

      <div className="filter-panel">
        <div className="preset-row">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`preset${preset === item.id ? " preset--active" : ""}`}
              onClick={() => applyPreset(item.id, item.days)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
          </label>
          <label className="field">
            <span>Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {ENTRY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="metric-row">
        <div className="metric">
          <b>{entries.length}</b>
          <span>Logs</span>
        </div>
        <div className="metric">
          <b>{ticketCount}</b>
          <span>Work logs</span>
        </div>
        <div className="metric">
          <b>{doneCount}</b>
          <span>Done · {openCount} still open</span>
        </div>
        <div className="metric">
          <b>{activeDays}</b>
          <span>{series.weekly ? "Active weeks" : "Active days"}</span>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <p className="empty">Loading charts...</p>
      ) : entries.length === 0 ? (
        <p className="empty">No logs in this range.</p>
      ) : (
        <>
          <section className="section panel">
            <div className="section-head">
              <h2>Activity</h2>
              <span className="muted">
                {series.weekly ? "Grouped by week. " : ""}
                {loading ? "Updating… " : ""}
                Peak {peak.label} · {peak.value}
              </span>
            </div>
            <ColumnChart points={series.points} />
          </section>

          <div className="chart-grid">
            <section className="section panel">
              <div className="section-head">
                <h2>By type</h2>
              </div>
              <BarList rows={typeRows} />
            </section>
            <section className="section panel">
              <div className="section-head">
                <h2>Log status</h2>
                <span className="muted">{ticketCount} logs</span>
              </div>
              <div className="stack" aria-hidden>
                {statusRows.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      width: `${ticketCount ? (row.value / ticketCount) * 100 : 0}%`,
                      background: row.color,
                    }}
                  />
                ))}
              </div>
              <BarList rows={statusRows} />
            </section>
          </div>

          <section className="section panel">
            <div className="section-head">
              <h2>By project</h2>
            </div>
            {projectRows.length === 0 ? (
              <p className="empty">No project data.</p>
            ) : (
              <BarList rows={projectRows} />
            )}
          </section>
        </>
      )}
    </>
  );
}

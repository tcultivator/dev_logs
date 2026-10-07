"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { presentWeek, type ConsolidatedWeek } from "@/lib/consolidated";
import {
  BUILTIN_FORMAT,
  FORMAT_FONTS,
  ReportAlign,
  ReportFormat,
  ReportLayout,
  ReportNote,
  parseReportFormat,
} from "@/lib/report-format";

function fontChoices(current: string) {
  return Array.from(new Set([...FORMAT_FONTS, current].filter(Boolean)));
}

type Draft = {
  name: string;
  headerTitle: string;
  headerFont: string;
  headerTitleSize: string;
  headerDateSize: string;
  bodyFont: string;
  bodySize: string;
  bullet: string;
  accomplishmentsLabel: string;
  notes: ReportNote[];
  layout: ReportLayout;
};

function draftFrom(format: ReportFormat): Draft {
  return {
    name: "",
    headerTitle: format.headerTitle,
    headerFont: format.headerFont,
    headerTitleSize: String(format.headerTitleSize),
    headerDateSize: String(format.headerDateSize),
    bodyFont: format.bodyFont,
    bodySize: String(format.bodySize),
    bullet: format.bullet,
    accomplishmentsLabel: format.accomplishmentsLabel,
    notes: format.notes.map((note) => ({ ...note })),
    layout: format.layout,
  };
}

function alignCss(align: ReportAlign) {
  return align === "both" ? "justify" : align;
}

function pagePercent(layout: ReportLayout, twips: number) {
  return `${Math.min(28, (twips / layout.pageWidth) * 100)}%`;
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

export default function ConsolidatedFormatModal({
  weeks,
  personName,
  onClose,
  onExport,
}: {
  weeks: ConsolidatedWeek[];
  personName: string;
  onClose: () => void;
  onExport: (format: ReportFormat) => Promise<void>;
}) {
  const [formats, setFormats] = useState<ReportFormat[]>([BUILTIN_FORMAT]);
  const [selectedId, setSelectedId] = useState(BUILTIN_FORMAT.id);
  const [weekIndex, setWeekIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(BUILTIN_FORMAT));
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fromFile, setFromFile] = useState(false);
  const [error, setError] = useState("");

  const selected = formats.find((format) => format.id === selectedId) || formats[0];
  const week = weeks[Math.min(weekIndex, weeks.length - 1)];
  const projects = useMemo(() => (week ? presentWeek(week) : []), [week]);
  const preview = useMemo(() => {
    if (!adding) return selected;
    const parsed = parseReportFormat({
      ...draft,
      headerTitleSize: Number(draft.headerTitleSize),
      headerDateSize: Number(draft.headerDateSize),
      bodySize: Number(draft.bodySize),
    });
    return parsed.ok ? parsed.format : selected;
  }, [adding, draft, selected]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/formats")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load formats");
        const saved = (await res.json()) as ReportFormat[];
        if (cancelled) return;
        setFormats([BUILTIN_FORMAT, ...saved]);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load formats");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFormats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(format: ReportFormat) {
    setSelectedId(format.id);
    setError("");
    if (adding) setDraft(draftFrom(format));
  }

  async function uploadDocument(file: File) {
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch("/api/formats/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read that document");
      const parsed = parseReportFormat(data);
      if (!parsed.ok) throw new Error(parsed.error);
      setDraft({
        ...draftFrom(parsed.format),
        name: parsed.format.name,
      });
      setAdding(true);
      setFromFile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that document");
    } finally {
      setUploading(false);
    }
  }

  function updateNote(index: number, key: keyof ReportNote, value: string) {
    setDraft((current) => ({
      ...current,
      notes: current.notes.map((note, noteIndex) =>
        noteIndex === index ? { ...note, [key]: value } : note
      ),
    }));
  }

  async function saveFormat(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const parsed = parseReportFormat({
      ...draft,
      headerTitleSize: Number(draft.headerTitleSize),
      headerDateSize: Number(draft.headerDateSize),
      bodySize: Number(draft.bodySize),
    });
    if (!parsed.ok) {
      setError(parsed.error);
      setSaving(false);
      return;
    }

    try {
      const res = await apiFetch("/api/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.format),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the format");
      const saved = data as ReportFormat;
      setFormats((current) => [...current, saved]);
      setSelectedId(saved.id);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the format");
    } finally {
      setSaving(false);
    }
  }

  async function removeFormat(format: ReportFormat) {
    setError("");
    const res = await apiFetch(`/api/formats/${format.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete the format");
      return;
    }
    setFormats((current) => current.filter((item) => item.id !== format.id));
    if (selectedId === format.id) setSelectedId(BUILTIN_FORMAT.id);
  }

  async function exportReport() {
    setExporting(true);
    setError("");
    try {
      await onExport(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setExporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-format-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-head">
          <div>
            <h3 id="report-format-title">Consolidated preview</h3>
            <p className="muted">
              This snapshot stays in the app. Export downloads the Word file.
            </p>
          </div>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="report-layout">
          <aside className="report-formats">
            <div className="section-head">
              <h3>Format</h3>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  setAdding((open) => !open);
                  setFromFile(false);
                  setDraft(draftFrom(selected));
                  setError("");
                }}
              >
                {adding ? "Cancel" : "Add format"}
              </button>
            </div>
            <label className="btn btn--ghost report-upload">
              {uploading ? "Reading document..." : "Upload document"}
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) uploadDocument(file);
                }}
              />
            </label>
            {loadingFormats ? <p className="muted">Loading formats...</p> : null}
            <div className="report-format-list">
              {formats.map((format) => (
                <div
                  key={format.id}
                  className={`report-format${
                    format.id === selected.id ? " report-format--on" : ""
                  }`}
                >
                  <button type="button" onClick={() => choose(format)}>
                    <strong>{format.name}</strong>
                    <span>{format.headerTitle}</span>
                  </button>
                  {format.builtin ? null : (
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={() => removeFormat(format)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>

            {adding ? (
              <form className="report-form" onSubmit={saveFormat}>
                <p className="muted">
                  {fromFile
                    ? "Taken from the uploaded document, including its page layout. Save it to keep this format."
                    : "The new format starts from the one selected above."}
                </p>
                <label className="field">
                  <span>Format name</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder="My weekly report"
                    required
                  />
                </label>
                <label className="field">
                  <span>Header title</span>
                  <input
                    value={draft.headerTitle}
                    onChange={(event) =>
                      setDraft({ ...draft, headerTitle: event.target.value })
                    }
                    required
                  />
                </label>
                <div className="report-form-grid">
                  <label className="field">
                    <span>Header font</span>
                    <select
                      value={draft.headerFont}
                      onChange={(event) =>
                        setDraft({ ...draft, headerFont: event.target.value })
                      }
                    >
                      {fontChoices(draft.headerFont).map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Title size</span>
                    <input
                      type="number"
                      min={12}
                      max={36}
                      value={draft.headerTitleSize}
                      onChange={(event) =>
                        setDraft({ ...draft, headerTitleSize: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Date size</span>
                    <input
                      type="number"
                      min={8}
                      max={24}
                      value={draft.headerDateSize}
                      onChange={(event) =>
                        setDraft({ ...draft, headerDateSize: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Body font</span>
                    <select
                      value={draft.bodyFont}
                      onChange={(event) =>
                        setDraft({ ...draft, bodyFont: event.target.value })
                      }
                    >
                      {fontChoices(draft.bodyFont).map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Body size</span>
                    <input
                      type="number"
                      min={9}
                      max={18}
                      value={draft.bodySize}
                      onChange={(event) =>
                        setDraft({ ...draft, bodySize: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Bullet</span>
                    <input
                      value={draft.bullet}
                      maxLength={3}
                      onChange={(event) =>
                        setDraft({ ...draft, bullet: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Accomplishments heading</span>
                  <input
                    value={draft.accomplishmentsLabel}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        accomplishmentsLabel: event.target.value,
                      })
                    }
                    required
                  />
                </label>
                {draft.notes.map((note, index) => (
                  <div className="report-form-grid" key={index}>
                    <label className="field">
                      <span>Section {index + 1}</span>
                      <input
                        value={note.heading}
                        onChange={(event) =>
                          updateNote(index, "heading", event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Line</span>
                      <input
                        value={note.value}
                        onChange={(event) =>
                          updateNote(index, "value", event.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save format"}
                </button>
              </form>
            ) : null}
          </aside>

          <div className="report-stage">
            <div className="report-week-nav">
              <button
                className="btn btn--ghost"
                type="button"
                disabled={weekIndex === 0}
                onClick={() => setWeekIndex((index) => Math.max(0, index - 1))}
              >
                Previous week
              </button>
              <span>
                {week?.label} · {weekIndex + 1} of {weeks.length}
              </span>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={weekIndex >= weeks.length - 1}
                onClick={() =>
                  setWeekIndex((index) => Math.min(weeks.length - 1, index + 1))
                }
              >
                Next week
              </button>
            </div>

            {week ? (
              <article
                className="report-sheet"
                style={{
                  width: preview.layout.pageWidth >= preview.layout.pageHeight
                    ? "min(100%, 760px)"
                    : "min(100%, 640px)",
                  padding: `${pagePercent(preview.layout, Math.max(preview.layout.header, preview.layout.marginTop))} ${pagePercent(preview.layout, preview.layout.marginRight)} ${pagePercent(preview.layout, preview.layout.marginBottom)} ${pagePercent(preview.layout, preview.layout.marginLeft)}`,
                  fontFamily: preview.bodyFont,
                  fontSize: `${preview.bodySize}pt`,
                  lineHeight: preview.layout.line / 240,
                }}
              >
                <header
                  style={{
                    fontFamily: preview.headerFont,
                    textAlign: alignCss(preview.layout.headerAlign),
                    fontWeight: preview.layout.headerBold ? 700 : 400,
                  }}
                >
                  <strong
                    style={{
                      fontSize: `${preview.headerTitleSize}pt`,
                      fontWeight: preview.layout.headerBold ? 700 : 400,
                    }}
                  >
                    {preview.headerTitle}
                  </strong>
                  <span
                    style={{
                      fontSize: `${preview.headerDateSize}pt`,
                      fontWeight: preview.layout.headerBold ? 700 : 400,
                    }}
                  >
                    {week.label}
                  </span>
                </header>
                {personName ? (
                  <p
                    className="report-name"
                    style={{
                      textAlign: alignCss(preview.layout.nameAlign),
                      fontWeight: preview.layout.nameBold ? 700 : 400,
                    }}
                  >
                    {personName}
                  </p>
                ) : null}
                <p
                  className="report-acc"
                  style={{
                    textAlign: alignCss(preview.layout.accomplishmentsAlign),
                    fontWeight: preview.layout.accomplishmentsBold ? 700 : 400,
                    textDecoration: preview.layout.accomplishmentsUnderline
                      ? "underline"
                      : "none",
                  }}
                >
                  {preview.accomplishmentsLabel}
                </p>
                {projects.map((project) => (
                  <section key={`${project.name}-${project.lines[0]}`}>
                    {project.name ? (
                      <p
                        className="report-project"
                        style={{
                          textAlign: alignCss(preview.layout.projectAlign),
                          fontWeight: preview.layout.projectBold ? 700 : 400,
                        }}
                      >
                        {project.name}
                      </p>
                    ) : null}
                    <ul style={{ paddingLeft: pagePercent(preview.layout, preview.layout.bulletLeft) }}>
                      {project.lines.map((line, index) => (
                        <li key={`${index}-${line}`}>
                          <span>{preview.bullet}</span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {preview.notes.map((note) =>
                  note.heading || note.value ? (
                    <section key={`${note.heading}-${note.value}`}>
                      {note.heading ? (
                        <p
                          className="report-note"
                          style={{
                            textAlign: alignCss(preview.layout.noteAlign),
                            fontWeight: preview.layout.noteBold ? 700 : 400,
                          }}
                        >
                          {note.heading}
                        </p>
                      ) : null}
                      {note.value ? (
                        <ul style={{ paddingLeft: pagePercent(preview.layout, preview.layout.bulletLeft) }}>
                          <li>
                            <span>{preview.bullet}</span>
                            {note.value}
                          </li>
                        </ul>
                      ) : null}
                    </section>
                  ) : null
                )}
              </article>
            ) : null}
          </div>
        </div>

        <div className="btn-row">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            onClick={exportReport}
            disabled={exporting || !selected}
          >
            {exporting ? "Exporting..." : "Export Word"}
          </button>
        </div>
      </div>
    </div>
  );
}

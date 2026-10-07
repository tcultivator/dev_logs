import { parseLoggedOn } from "@/lib/entries";
import {
  createEntry,
  createProject,
  listProjects,
} from "@/lib/models";

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export type ImportedTask = {
  project: string;
  title: string;
  body: string;
};

export type ImportedReport = {
  from: string;
  to: string;
  tasks: ImportedTask[];
};

type PartialDate = { year?: number; month?: number; day: number };

function monthIndex(name: string) {
  const index = MONTHS[name.toLowerCase()];
  return index === undefined ? null : index;
}

function ymd(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function stripWeekday(value: string) {
  return value
    .replace(
      /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun),?\s+/i,
      ""
    )
    .trim();
}

function parseDatePiece(raw: string): PartialDate | null {
  const value = stripWeekday(raw.trim());
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]) - 1, day: Number(iso[3]) };
  }

  let match = value.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s*(\d{4})?$/);
  if (match && monthIndex(match[1]) !== null) {
    return {
      month: monthIndex(match[1])!,
      day: Number(match[2]),
      year: match[3] ? Number(match[3]) : undefined,
    };
  }

  match = value.match(/^(\d{1,2})\s+([A-Za-z]+)(?:,)?\s*(\d{4})?$/);
  if (match && monthIndex(match[2]) !== null) {
    return {
      day: Number(match[1]),
      month: monthIndex(match[2])!,
      year: match[3] ? Number(match[3]) : undefined,
    };
  }

  match = value.match(/^(\d{1,2})(?:,)?\s*(\d{4})?$/);
  if (match) {
    return {
      day: Number(match[1]),
      year: match[2] ? Number(match[2]) : undefined,
    };
  }

  return null;
}

function resolveSpan(start: PartialDate, end?: PartialDate) {
  const finish = end ?? start;
  const year = start.year ?? finish.year;
  const month = start.month ?? finish.month;
  const endYear = finish.year ?? year;
  const endMonth = finish.month ?? month;
  if (year == null || month == null || endYear == null || endMonth == null) {
    return null;
  }
  const from = ymd(year, month, start.day);
  const to = ymd(endYear, endMonth, finish.day);
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function parseAccomplishmentDate(value: string) {
  const parts = value
    .split(/\s+(?:-|–|—|to)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 2) return null;
  const start = parseDatePiece(parts[0]);
  if (!start) return null;
  let end: PartialDate | undefined;
  if (parts[1]) {
    const parsedEnd = parseDatePiece(parts[1]);
    if (!parsedEnd) return null;
    end = parsedEnd;
  }
  return resolveSpan(start, end);
}

function taskSection(block: string) {
  const lines = block.split(/\r?\n/);
  const tasksAt = lines.findIndex((line) =>
    /^tasks completed\s*:?\s*$/i.test(line.trim())
  );
  const start = tasksAt >= 0 ? tasksAt + 1 : 1;
  const endAt = lines.findIndex(
    (line, index) =>
      index >= start &&
      /^(?:issues encountered|next tasks|time spent|progress(?:\s*\(%\))?|remarks)\b/i.test(
        line.trim()
      )
  );
  return lines.slice(start, endAt === -1 ? undefined : endAt);
}

function isSkippedLine(line: string) {
  return /^(?:daily accomplishment|name\s*:|date\s*:)\b/i.test(line);
}

function parseTasks(lines: string[]): ImportedTask[] {
  const tasks: ImportedTask[] = [];
  let project = "";
  let title = "";
  let bullets: string[] = [];

  function flush() {
    const name = project.trim().slice(0, 191);
    const taskTitle = (title || bullets[0] || name).trim();
    if (!taskTitle && !bullets.length) return;
    const finalTitle = taskTitle.slice(0, 255);
    const body = (bullets.length ? bullets.join("\n") : finalTitle).trim();
    if (finalTitle && body) {
      tasks.push({ project: name, title: finalTitle, body });
    }
    title = "";
    bullets = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isSkippedLine(line)) {
      if (!line && (title || bullets.length)) flush();
      continue;
    }

    const projectMatch = line.match(/^\[(.+)\]$/);
    if (projectMatch) {
      flush();
      project = projectMatch[1].trim();
      continue;
    }

    const bullet = line.match(/^(?:[-*•–—]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1].trim());
      continue;
    }

    if (title || bullets.length) flush();
    title = line;
  }

  flush();
  return tasks;
}

function splitReports(text: string) {
  const lines = text.split(/\r?\n/);
  const starts = lines
    .map((line, index) => (/^date\s*:/i.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0);
  if (!starts.length) return [];
  return starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? lines.length).join("\n")
  );
}

export function parseAccomplishmentImport(
  text: string
): { ok: true; reports: ImportedReport[] } | { ok: false; error: string } {
  const blocks = splitReports(text);
  if (!blocks.length) {
    return {
      ok: false,
      error:
        "Add a Date line, for example Date: Aug 10, 2026 - Aug 15, 2026.",
    };
  }

  const reports: ImportedReport[] = [];

  for (const block of blocks) {
    const dateLine = block.split(/\r?\n/)[0] || "";
    const dateValue = dateLine.replace(/^date\s*:/i, "").trim();
    const span = parseAccomplishmentDate(dateValue);
    if (!span) {
      return {
        ok: false,
        error: `Could not read the date "${dateValue}". Use a date like Aug 10, 2026 or Aug 10, 2026 - Aug 15, 2026.`,
      };
    }

    const fromCheck = parseLoggedOn(span.from);
    if (!fromCheck.ok) return fromCheck;
    const toCheck = parseLoggedOn(span.to);
    if (!toCheck.ok) return toCheck;

    const tasks = parseTasks(taskSection(block));
    if (!tasks.length) {
      return {
        ok: false,
        error: `No tasks found for ${span.from}. Put work under Tasks Completed, with a [Project] line, a title, and the items.`,
      };
    }

    reports.push({ from: span.from, to: span.to, tasks });
  }

  return { ok: true, reports };
}

export async function saveAccomplishmentImport(userId: string, text: string) {
  const parsed = parseAccomplishmentImport(text);
  if (!parsed.ok) return parsed;

  const existing = await listProjects(userId);
  const byName = new Map(
    existing.map((project) => [project.name.trim().toLowerCase(), project])
  );

  let created = 0;
  let from = "";
  let to = "";

  for (const report of parsed.reports) {
    const loggedOn = parseLoggedOn(report.from);
    if (!loggedOn.ok) return loggedOn;

    for (const task of report.tasks) {
      let projectId: string | null = null;
      const projectName = task.project.trim();
      if (projectName) {
        const key = projectName.toLowerCase();
        let project = byName.get(key);
        if (!project) {
          project = await createProject(userId, projectName, null);
          byName.set(key, project);
        }
        projectId = project.id;
      }

      await createEntry({
        userId,
        title: task.title,
        body: task.body,
        type: "TICKET",
        tags: null,
        projectId,
        status: "DONE",
        loggedOn: loggedOn.date,
      });
      created += 1;
    }

    from = !from || report.from < from ? report.from : from;
    to = !to || report.to > to ? report.to : to;
  }

  return { ok: true as const, created, from, to };
}

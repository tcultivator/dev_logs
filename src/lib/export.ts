import { EntryType, formatDate } from "@/lib/entries";

export type ExportEntry = {
  title: string;
  body: string;
  type: EntryType;
  done: boolean;
};

function groupByTitle(entries: ExportEntry[]) {
  const map = new Map<string, { title: string; notes: string[] }>();

  for (const entry of entries) {
    const key = entry.title.trim().toLowerCase();
    const note = entry.body.trim();
    if (!note) continue;

    const existing = map.get(key);
    if (existing) {
      existing.notes.push(note);
    } else {
      map.set(key, { title: entry.title.trim(), notes: [note] });
    }
  }

  return Array.from(map.values());
}

/** Strip existing list markers so every line gets the same bullet. */
function stripBulletPrefix(line: string) {
  return line
    .replace(/^\s*(?:[-*•–—▪▸►●○]|[\d]+[.)])\s+/, "")
    .trim();
}

function toBulletLines(note: string) {
  return note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${stripBulletPrefix(line)}`);
}

function formatGroupedSection(groups: { title: string; notes: string[] }[]) {
  if (!groups.length) return "";

  return groups
    .map((group) => {
      const bullets = group.notes.flatMap(toBulletLines).join("\n");
      return `${group.title}\n${bullets}`;
    })
    .join("\n\n");
}

export function buildDailyAccomplishmentText(options: {
  name?: string;
  date: Date | string;
  entries: ExportEntry[];
}) {
  const reportDate = formatDate(options.date);
  const name = options.name?.trim() || "";

  const completed = options.entries.filter(
    (e) => e.type !== "TODO" && e.type !== "REMINDER"
  );
  const nextTasks = options.entries.filter(
    (e) =>
      (e.type === "TODO" || e.type === "REMINDER") && !e.done
  );

  const tasksText = formatGroupedSection(groupByTitle(completed));
  const nextText = formatGroupedSection(groupByTitle(nextTasks));

  return [
    "DAILY ACCOMPLISHMENT",
    "",
    `Name: ${name}`,
    `Date: ${reportDate}`,
    "",
    "Tasks Completed:",
    "",
    tasksText || "",
    "",
    "Issues Encountered:",
    "",
    "",
    "Next Tasks:",
    "",
    nextText || "",
    "",
    "Time Spent: ",
    "",
    "Progress (%):",
    "",
    "Remarks:",
    "",
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toInputDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseInputDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

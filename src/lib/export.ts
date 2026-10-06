import { EntryType, TicketStatus, formatDate } from "@/lib/entries";

export type ExportEntry = {
  title: string;
  body: string;
  type: EntryType;
  done: boolean;
  status?: TicketStatus | null;
  projectName?: string | null;
};

type TitleGroup = { title: string; notes: string[] };
type ProjectGroup = { project: string; titles: TitleGroup[] };

function groupByProjectThenTitle(entries: ExportEntry[]): ProjectGroup[] {
  const projectMap = new Map<
    string,
    { project: string; titles: Map<string, TitleGroup> }
  >();

  for (const entry of entries) {
    const note = entry.body.trim();
    if (!note) continue;

    const projectLabel = entry.projectName?.trim() || "No project";
    const projectKey = projectLabel.toLowerCase();
    const titleLabel = entry.title.trim();
    const titleKey = titleLabel.toLowerCase();

    let projectGroup = projectMap.get(projectKey);
    if (!projectGroup) {
      projectGroup = { project: projectLabel, titles: new Map() };
      projectMap.set(projectKey, projectGroup);
    }

    const existingTitle = projectGroup.titles.get(titleKey);
    if (existingTitle) {
      existingTitle.notes.push(note);
    } else {
      projectGroup.titles.set(titleKey, {
        title: titleLabel,
        notes: [note],
      });
    }
  }

  return Array.from(projectMap.values()).map((group) => ({
    project: group.project,
    titles: Array.from(group.titles.values()),
  }));
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

function formatGroupedSection(projects: ProjectGroup[]) {
  if (!projects.length) return "";

  return projects
    .map((project) => {
      const titleBlocks = project.titles
        .map((group) => {
          const bullets = group.notes.flatMap(toBulletLines).join("\n");
          return `${group.title}\n${bullets}`;
        })
        .join("\n\n");

      return `[${project.project}]\n\n${titleBlocks}`;
    })
    .join("\n\n");
}

function isDoneTicket(entry: ExportEntry) {
  return entry.type === "TICKET" && (entry.status === "DONE" || entry.done);
}

export function buildDailyAccomplishmentText(options: {
  name?: string;
  date: Date | string;
  dateEnd?: Date | string;
  /** Done tickets resolved in range (Tasks Completed). */
  completedTickets: ExportEntry[];
}) {
  const startLabel = formatDate(options.date);
  const endLabel = options.dateEnd ? formatDate(options.dateEnd) : null;
  const reportDate =
    endLabel && endLabel !== startLabel
      ? `${startLabel} - ${endLabel}`
      : startLabel;
  const name = options.name?.trim() || "";

  const completed = options.completedTickets.filter(isDoneTicket);
  const tasksText = formatGroupedSection(groupByProjectThenTitle(completed));

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

import {
  AlignmentType,
  Document,
  Header,
  LineRuleType,
  Packer,
  Paragraph,
  SectionType,
  TextRun,
  UnderlineType,
} from "docx";
import {
  BUILTIN_FORMAT,
  BUILTIN_LAYOUT,
  type ReportAlign,
  type ReportFormat,
} from "@/lib/report-format";

export type ConsolidatedItem = {
  projectName: string | null;
  title: string;
  body: string;
  at: Date | string;
};

export type ConsolidatedWeek = {
  start: Date;
  end: Date;
  label: string;
  projects: { name: string; lines: string[] }[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function layoutOf(format: ReportFormat) {
  return format.layout || BUILTIN_LAYOUT;
}

function wordAlign(align: ReportAlign) {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "both") return AlignmentType.BOTH;
  return AlignmentType.LEFT;
}

function halfPoints(points: number) {
  return Math.round(points * 2);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const weekday = day.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(day, delta);
}

export function formatWeekRange(start: Date, end: Date) {
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    if (start.getDate() === end.getDate()) {
      return `${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTHS[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${MONTHS[start.getMonth()]} ${start.getDate()} - ${MONTHS[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} - ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function cleanLine(line: string) {
  return line
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/^(?:\s*(?:[-*•·∙●○■□▪▫►▶▸‣⁃–—✓✔☑➢➤➔→]|\d+[.)]))+\s*/, "")
    .trim();
}

function accomplishmentLines(item: ConsolidatedItem) {
  const lines = item.body
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  if (lines.length) return lines;
  const title = cleanLine(item.title);
  return title ? [title] : [];
}

function weeksCovering(from: Date, to: Date) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const weeks: { start: Date; end: Date; items: ConsolidatedItem[] }[] = [];
  let cursor = startOfWeek(first);

  while (dayKey(cursor) <= dayKey(last)) {
    const weekEnd = addDays(cursor, 6);
    const clipStart = dayKey(cursor) < dayKey(first) ? first : cursor;
    const clipEnd = dayKey(weekEnd) > dayKey(last) ? last : weekEnd;
    weeks.push({
      start: startOfDay(clipStart),
      end: startOfDay(clipEnd),
      items: [],
    });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

function mergeEmptyWeeks(
  weeks: { start: Date; end: Date; items: ConsolidatedItem[] }[]
) {
  const merged: { start: Date; end: Date; items: ConsolidatedItem[] }[] = [];
  let leadStart: Date | null = null;

  for (const week of weeks) {
    if (!week.items.length) {
      if (merged.length) merged[merged.length - 1].end = week.end;
      else if (!leadStart) leadStart = week.start;
      continue;
    }

    merged.push({
      start: leadStart ?? week.start,
      end: week.end,
      items: week.items,
    });
    leadStart = null;
  }

  return merged;
}

function groupProjects(items: ConsolidatedItem[]) {
  const grouped = new Map<string, string[]>();
  const order: string[] = [];

  for (const item of items) {
    const lines = accomplishmentLines(item);
    if (!lines.length) continue;
    const name = item.projectName?.trim() || "No project";
    const existing = grouped.get(name);
    if (existing) {
      existing.push(...lines);
    } else {
      grouped.set(name, [...lines]);
      order.push(name);
    }
  }

  return order.map((name) => ({
    name,
    lines: grouped.get(name) || [],
  }));
}

export function buildConsolidatedWeeks(items: ConsolidatedItem[]): ConsolidatedWeek[] {
  if (!items.length) return [];
  const sorted = [...items].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  const from = startOfDay(new Date(sorted[0].at));
  const to = startOfDay(new Date(sorted[sorted.length - 1].at));
  const weeks = weeksCovering(from, to);

  for (const item of sorted) {
    const key = dayKey(item.at);
    const week = weeks.find(
      (candidate) => key >= dayKey(candidate.start) && key <= dayKey(candidate.end)
    );
    if (week) week.items.push(item);
  }

  return mergeEmptyWeeks(weeks)
    .map((week) => ({
      start: week.start,
      end: week.end,
      label: formatWeekRange(week.start, week.end),
      projects: groupProjects(week.items),
    }))
    .filter((week) => week.projects.length);
}

function bodyRun(
  text: string,
  format: ReportFormat,
  options?: { bold?: boolean; underline?: boolean }
) {
  return new TextRun({
    text,
    bold: options?.bold,
    underline: options?.underline ? { type: UnderlineType.SINGLE } : undefined,
    font: format.bodyFont,
    size: halfPoints(format.bodySize),
  });
}

function bodyParagraph(
  text: string,
  format: ReportFormat,
  options?: {
    bold?: boolean;
    underline?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bullet?: boolean;
  }
) {
  const bullet = format.bullet || "•";
  const layout = layoutOf(format);
  return new Paragraph({
    alignment: options?.align,
    indent: options?.bullet
      ? { left: layout.bulletLeft, hanging: layout.bulletHanging }
      : undefined,
    spacing: {
      before: 0,
      after: 0,
      line: layout.line,
      lineRule: LineRuleType.AUTO,
      beforeAutoSpacing: Boolean(options?.bullet),
      afterAutoSpacing: Boolean(options?.bullet),
    },
    children: [bodyRun(options?.bullet ? `${bullet} ${text}` : text, format, options)],
  });
}

function headerParagraph(text: string, format: ReportFormat, points: number) {
  const layout = layoutOf(format);
  return new Paragraph({
    alignment: wordAlign(layout.headerAlign),
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({
        text,
        font: format.headerFont,
        size: halfPoints(points),
        bold: layout.headerBold,
      }),
    ],
  });
}

function reportHeader(label: string, format: ReportFormat) {
  return new Header({
    children: [
      headerParagraph(format.headerTitle, format, format.headerTitleSize),
      headerParagraph(label, format, format.headerDateSize),
    ],
  });
}

function isBlankProject(name: string) {
  const key = name.trim().toLowerCase();
  return !key || key === "recovered" || key === "no project";
}

export function presentWeek(week: ConsolidatedWeek) {
  return week.projects.flatMap((project) => {
    const lines = project.lines.filter(
      (item) => item.trim().toLowerCase() !== "recovered"
    );
    if (!lines.length) return [];
    return [
      {
        name: isBlankProject(project.name) ? "" : project.name,
        lines,
      },
    ];
  });
}

function weekParagraphs(
  name: string,
  week: ConsolidatedWeek,
  format: ReportFormat
) {
  const layout = layoutOf(format);
  const paragraphs: Paragraph[] = [];
  if (name) {
    paragraphs.push(
      bodyParagraph(name, format, {
        bold: layout.nameBold,
        align: wordAlign(layout.nameAlign),
      })
    );
  }
  paragraphs.push(
    bodyParagraph(format.accomplishmentsLabel, format, {
      bold: layout.accomplishmentsBold,
      underline: layout.accomplishmentsUnderline,
      align: wordAlign(layout.accomplishmentsAlign),
    })
  );

  for (const project of presentWeek(week)) {
    if (project.name) {
      paragraphs.push(
        bodyParagraph(project.name, format, {
          bold: layout.projectBold,
          align: wordAlign(layout.projectAlign),
        })
      );
    }
    for (const item of project.lines) {
      paragraphs.push(bodyParagraph(item, format, { bullet: true }));
    }
  }

  for (const note of format.notes) {
    if (note.heading) {
      paragraphs.push(
        bodyParagraph(note.heading, format, {
          bold: layout.noteBold,
          align: wordAlign(layout.noteAlign),
        })
      );
    }
    if (note.value) {
      paragraphs.push(bodyParagraph(note.value, format, { bullet: true }));
    }
  }

  return paragraphs;
}

export function buildConsolidatedParagraphs(
  name: string,
  weeks: ConsolidatedWeek[],
  format: ReportFormat = BUILTIN_FORMAT
) {
  return weeks.flatMap((week) => weekParagraphs(name.trim(), week, format));
}

export async function consolidatedDocxBlob(
  name: string,
  weeks: ConsolidatedWeek[],
  format: ReportFormat = BUILTIN_FORMAT
) {
  const displayName = name.trim();
  const layout = layoutOf(format);
  const doc = new Document({
    title: format.headerTitle,
    styles: {
      default: {
        document: {
          run: { font: format.bodyFont, size: halfPoints(format.bodySize) },
          paragraph: { spacing: { line: layout.line, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    sections: weeks.map((week) => ({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: layout.pageWidth, height: layout.pageHeight },
          margin: {
            top: layout.marginTop,
            right: layout.marginRight,
            bottom: layout.marginBottom,
            left: layout.marginLeft,
            header: layout.header,
            footer: layout.footer,
          },
        },
      },
      headers: { default: reportHeader(week.label, format) },
      children: weekParagraphs(displayName, week, format),
    })),
  });
  return Packer.toBlob(doc);
}

export async function downloadConsolidatedDocx(
  filename: string,
  name: string,
  weeks: ConsolidatedWeek[],
  format: ReportFormat = BUILTIN_FORMAT
) {
  const blob = await consolidatedDocxBlob(name, weeks, format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

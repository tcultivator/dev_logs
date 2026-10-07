export type ReportNote = {
  heading: string;
  value: string;
};

export type ReportAlign = "left" | "center" | "right" | "both";

export type ReportLayout = {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  header: number;
  footer: number;
  headerAlign: ReportAlign;
  headerBold: boolean;
  nameAlign: ReportAlign;
  nameBold: boolean;
  accomplishmentsAlign: ReportAlign;
  accomplishmentsBold: boolean;
  accomplishmentsUnderline: boolean;
  projectAlign: ReportAlign;
  projectBold: boolean;
  noteAlign: ReportAlign;
  noteBold: boolean;
  bulletLeft: number;
  bulletHanging: number;
  line: number;
};

export type ReportFormat = {
  id: string;
  name: string;
  builtin: boolean;
  headerTitle: string;
  headerFont: string;
  headerTitleSize: number;
  headerDateSize: number;
  bodyFont: string;
  bodySize: number;
  bullet: string;
  accomplishmentsLabel: string;
  notes: ReportNote[];
  layout: ReportLayout;
};

export const FORMAT_FONTS = [
  "Arial Black",
  "Arial",
  "Cambria",
  "Calibri",
  "Times New Roman",
  "Georgia",
  "Tahoma",
] as const;

export const BUILTIN_LAYOUT: ReportLayout = {
  pageWidth: 12240,
  pageHeight: 20160,
  marginTop: 720,
  marginRight: 720,
  marginBottom: 2240,
  marginLeft: 720,
  header: 920,
  footer: 520,
  headerAlign: "center",
  headerBold: false,
  nameAlign: "center",
  nameBold: true,
  accomplishmentsAlign: "both",
  accomplishmentsBold: true,
  accomplishmentsUnderline: true,
  projectAlign: "left",
  projectBold: false,
  noteAlign: "left",
  noteBold: true,
  bulletLeft: 720,
  bulletHanging: 360,
  line: 240,
};

const AUGUST_NOTES: ReportNote[] = [
  { heading: "Issues Encountered:", value: "Not specified." },
  { heading: "Next Tasks:", value: "Not specified." },
  { heading: "Time Spent:", value: "Not specified." },
  { heading: "Progress (%):", value: "Ongoing / Testing." },
  { heading: "Remarks:", value: "Not specified." },
];

export const BUILTIN_FORMAT: ReportFormat = {
  id: "builtin-august",
  name: "August report",
  builtin: true,
  headerTitle: "DAILY ACCOMPLISHMENT REPORT",
  headerFont: "Arial Black",
  headerTitleSize: 20,
  headerDateSize: 10,
  bodyFont: "Cambria",
  bodySize: 11,
  bullet: "•",
  accomplishmentsLabel: "Accomplishments :",
  notes: AUGUST_NOTES,
  layout: BUILTIN_LAYOUT,
};

export type ReportFormatInput = {
  name?: unknown;
  headerTitle?: unknown;
  headerFont?: unknown;
  headerTitleSize?: unknown;
  headerDateSize?: unknown;
  bodyFont?: unknown;
  bodySize?: unknown;
  bullet?: unknown;
  accomplishmentsLabel?: unknown;
  notes?: unknown;
  layout?: unknown;
};

function text(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function points(value: unknown, fallback: number, min: number, max: number) {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(max, Math.max(min, Math.round(size)));
}

function font(value: unknown, fallback: string) {
  const name = text(value, 40);
  if ((FORMAT_FONTS as readonly string[]).includes(name)) return name;
  if (/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(name)) return name;
  return fallback;
}

function bullet(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001F\uE000-\uF8FF]/g, "")
    .trim()
    .slice(0, 3);
  return cleaned || "•";
}

function align(value: unknown, fallback: ReportAlign): ReportAlign {
  const key = String(value ?? "").toLowerCase();
  if (key === "center") return "center";
  if (key === "right" || key === "end") return "right";
  if (key === "both" || key === "justify" || key === "distribute") return "both";
  if (key === "left" || key === "start") return "left";
  return fallback;
}

function flagValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function twips(value: unknown, fallback: number, min: number, max: number) {
  const size = Number(value);
  if (!Number.isFinite(size)) return fallback;
  return Math.min(max, Math.max(min, Math.round(size)));
}

function layout(value: unknown): ReportLayout {
  const row = value && typeof value === "object" ? (value as Partial<ReportLayout>) : {};
  const base = BUILTIN_LAYOUT;
  return {
    pageWidth: twips(row.pageWidth, base.pageWidth, 5760, 24480),
    pageHeight: twips(row.pageHeight, base.pageHeight, 5760, 31680),
    marginTop: twips(row.marginTop, base.marginTop, 0, 5760),
    marginRight: twips(row.marginRight, base.marginRight, 0, 5760),
    marginBottom: twips(row.marginBottom, base.marginBottom, 0, 5760),
    marginLeft: twips(row.marginLeft, base.marginLeft, 0, 5760),
    header: twips(row.header, base.header, 0, 3600),
    footer: twips(row.footer, base.footer, 0, 3600),
    headerAlign: align(row.headerAlign, base.headerAlign),
    headerBold: flagValue(row.headerBold, base.headerBold),
    nameAlign: align(row.nameAlign, base.nameAlign),
    nameBold: flagValue(row.nameBold, base.nameBold),
    accomplishmentsAlign: align(row.accomplishmentsAlign, base.accomplishmentsAlign),
    accomplishmentsBold: flagValue(row.accomplishmentsBold, base.accomplishmentsBold),
    accomplishmentsUnderline: flagValue(
      row.accomplishmentsUnderline,
      base.accomplishmentsUnderline
    ),
    projectAlign: align(row.projectAlign, base.projectAlign),
    projectBold: flagValue(row.projectBold, base.projectBold),
    noteAlign: align(row.noteAlign, base.noteAlign),
    noteBold: flagValue(row.noteBold, base.noteBold),
    bulletLeft: twips(row.bulletLeft, base.bulletLeft, 0, 2880),
    bulletHanging: twips(row.bulletHanging, base.bulletHanging, 0, 1440),
    line: twips(row.line, base.line, 120, 960),
  };
}

function notes(value: unknown): ReportNote[] {
  if (!Array.isArray(value)) return AUGUST_NOTES.map((note) => ({ ...note }));
  const parsed = value.slice(0, 8).map((note) => {
    const row = note && typeof note === "object" ? (note as ReportNote) : { heading: "", value: "" };
    return {
      heading: text(row.heading, 80),
      value: text(row.value, 160),
    };
  });
  return parsed.length ? parsed : AUGUST_NOTES.map((note) => ({ ...note }));
}

export function parseReportFormat(
  input: ReportFormatInput,
  id = "",
  builtin = false
): { ok: true; format: ReportFormat } | { ok: false; error: string } {
  const name = text(input.name, 80);
  const headerTitle = text(input.headerTitle, 120);
  const accomplishmentsLabel = text(input.accomplishmentsLabel, 80);
  if (!name) return { ok: false, error: "Format name is required." };
  if (!headerTitle) return { ok: false, error: "Header title is required." };
  if (!accomplishmentsLabel) {
    return { ok: false, error: "Accomplishments heading is required." };
  }

  return {
    ok: true,
    format: {
      id,
      name,
      builtin,
      headerTitle,
      headerFont: font(input.headerFont, BUILTIN_FORMAT.headerFont),
      headerTitleSize: points(input.headerTitleSize, 20, 12, 36),
      headerDateSize: points(input.headerDateSize, 10, 8, 24),
      bodyFont: font(input.bodyFont, BUILTIN_FORMAT.bodyFont),
      bodySize: points(input.bodySize, 11, 9, 18),
      bullet: bullet(input.bullet),
      accomplishmentsLabel,
      notes: notes(input.notes),
      layout: layout(input.layout),
    },
  };
}

export function formatConfig(format: ReportFormat) {
  return {
    headerTitle: format.headerTitle,
    headerFont: format.headerFont,
    headerTitleSize: format.headerTitleSize,
    headerDateSize: format.headerDateSize,
    bodyFont: format.bodyFont,
    bodySize: format.bodySize,
    bullet: format.bullet,
    accomplishmentsLabel: format.accomplishmentsLabel,
    notes: format.notes,
    layout: format.layout,
  };
}

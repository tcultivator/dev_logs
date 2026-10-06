export const ENTRY_TYPE_VALUES = [
  "TICKET",
  "LEARNING",
  "DB_CHANGE",
  "SQL",
  "SNIPPET",
] as const;

export type EntryType = (typeof ENTRY_TYPE_VALUES)[number];

export const DEFAULT_ENTRY_TYPE: EntryType = "TICKET";

export const ENTRY_TYPES: {
  value: EntryType;
  label: string;
  color: string;
}[] = [
  { value: "TICKET", label: "Ticket", color: "#0f766e" },
  { value: "LEARNING", label: "Learning", color: "#7c3aed" },
  { value: "DB_CHANGE", label: "DB Change", color: "#15803d" },
  { value: "SQL", label: "SQL", color: "#a16207" },
  { value: "SNIPPET", label: "Snippet", color: "#1d4ed8" },
];

export const TICKET_STATUS_VALUES = ["OPEN", "IN_PROGRESS", "DONE"] as const;

export type TicketStatus = (typeof TICKET_STATUS_VALUES)[number];

export const TICKET_STATUSES: {
  value: TicketStatus;
  label: string;
}[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export const OPEN_TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS"];

export function typeMeta(type: EntryType) {
  return ENTRY_TYPES.find((t) => t.value === type) ?? ENTRY_TYPES[0];
}

export function statusMeta(status: TicketStatus | null | undefined) {
  if (!status) return null;
  return TICKET_STATUSES.find((s) => s.value === status) ?? null;
}

export function isTicketType(type: EntryType) {
  return type === "TICKET";
}

export function isOpenTicketStatus(status: TicketStatus | null | undefined) {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export function parseTags(tags: string | null | undefined): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formatTags(tags: string[]): string {
  return tags.join(", ");
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC shift). */
export function parseLocalDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isCodeType(type: EntryType) {
  return type === "SQL" || type === "SNIPPET";
}

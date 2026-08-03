export const ENTRY_TYPE_VALUES = [
  "PROGRESS",
  "LEARNING",
  "DB_CHANGE",
  "SQL",
  "SNIPPET",
  "REMINDER",
  "TODO",
] as const;

export type EntryType = (typeof ENTRY_TYPE_VALUES)[number];

export const ENTRY_TYPES: {
  value: EntryType;
  label: string;
  color: string;
}[] = [
  { value: "PROGRESS", label: "Progress", color: "#111111" },
  { value: "LEARNING", label: "Learning", color: "#111111" },
  { value: "DB_CHANGE", label: "DB Change", color: "#111111" },
  { value: "SQL", label: "SQL", color: "#111111" },
  { value: "SNIPPET", label: "Snippet", color: "#111111" },
  { value: "REMINDER", label: "Reminder", color: "#111111" },
  { value: "TODO", label: "Todo", color: "#111111" },
];

export function typeMeta(type: EntryType) {
  return ENTRY_TYPES.find((t) => t.value === type) ?? ENTRY_TYPES[0];
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

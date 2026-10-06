export const SCRATCH_STORAGE_KEY = "devlog-scratch";

export type ScratchKind = "note" | "list" | "code";

export type ScratchBlock = {
  id: string;
  kind: ScratchKind;
  title: string;
  body: string;
};

export type ListLine = {
  done: boolean;
  text: string;
};

export function newScratchId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `scratch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newScratchBlock(kind: ScratchKind): ScratchBlock {
  return {
    id: newScratchId(),
    kind,
    title: "",
    body: "",
  };
}

export function defaultScratchBlocks(): ScratchBlock[] {
  return [newScratchBlock("note")];
}

export function parseListLines(body: string): ListLine[] {
  const raw = body.length ? body.split("\n") : [""];
  return raw.map((line) => {
    if (line.startsWith("[x] ") || line.startsWith("[X] ")) {
      return { done: true, text: line.slice(4) };
    }
    if (line.startsWith("[ ] ")) {
      return { done: false, text: line.slice(4) };
    }
    return { done: false, text: line };
  });
}

export function serializeListLines(lines: ListLine[]): string {
  return lines.map((line) => `${line.done ? "[x]" : "[ ]"} ${line.text}`).join("\n");
}

export function loadScratchBlocks(): ScratchBlock[] {
  if (typeof window === "undefined") return defaultScratchBlocks();
  try {
    const raw = localStorage.getItem(SCRATCH_STORAGE_KEY);
    if (!raw) return defaultScratchBlocks();
    const parsed = JSON.parse(raw) as ScratchBlock[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultScratchBlocks();
    return parsed.filter(
      (block) =>
        block &&
        typeof block.id === "string" &&
        (block.kind === "note" || block.kind === "list" || block.kind === "code")
    );
  } catch {
    return defaultScratchBlocks();
  }
}

export function saveScratchBlocks(blocks: ScratchBlock[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCRATCH_STORAGE_KEY, JSON.stringify(blocks));
}

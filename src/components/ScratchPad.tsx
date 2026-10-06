"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  ListLine,
  ScratchBlock,
  ScratchKind,
  defaultScratchBlocks,
  loadScratchBlocks,
  newScratchBlock,
  parseListLines,
  saveScratchBlocks,
  serializeListLines,
} from "@/lib/scratch";

const KIND_LABEL: Record<ScratchKind, string> = {
  note: "Note",
  list: "List",
  code: "Code",
};

export default function ScratchPad() {
  const [blocks, setBlocks] = useState<ScratchBlock[]>(() =>
    defaultScratchBlocks()
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBlocks(loadScratchBlocks());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveScratchBlocks(blocks);
  }, [blocks, ready]);

  function updateBlock(id: string, patch: Partial<ScratchBlock>) {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, ...patch } : block))
    );
  }

  function addBlock(kind: ScratchKind) {
    setBlocks((prev) => [...prev, newScratchBlock(kind)]);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((block) => block.id === id);
      const nextIndex = index + dir;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function removeBlock(id: string) {
    setBlocks((prev) => {
      const next = prev.filter((block) => block.id !== id);
      return next.length ? next : defaultScratchBlocks();
    });
  }

  function clearPaper() {
    if (!confirm("Clear this scratch paper?")) return;
    setBlocks(defaultScratchBlocks());
  }

  function updateList(id: string, lines: ListLine[]) {
    const next = lines.length ? lines : [{ done: false, text: "" }];
    updateBlock(id, { body: serializeListLines(next) });
  }

  return (
    <section className="scratch-wrap">
      <div className="scratch-toolbar">
        <div className="scratch-hint">
          Autosaved here on this computer · not in the log
        </div>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => addBlock("note")}
          >
            + Note
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => addBlock("list")}
          >
            + List
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => addBlock("code")}
          >
            + Code
          </button>
          <button className="btn danger" type="button" onClick={clearPaper}>
            Clear paper
          </button>
        </div>
      </div>

      <div className="scratch-paper">
        <div className="scratch-margin" aria-hidden="true" />
        <div className="scratch-blocks">
          {blocks.map((block, index) => (
            <article key={block.id} className={`scratch-block ${block.kind}`}>
              <header className="scratch-block-head">
                <span
                  className="chip type scratch-kind"
                  style={{
                    ["--chip" as string]:
                      block.kind === "code"
                        ? "#86efac"
                        : block.kind === "list"
                          ? "#c4b5fd"
                          : "#67e8f9",
                  }}
                >
                  {KIND_LABEL[block.kind]}
                </span>
                <input
                  className="scratch-title"
                  value={block.title}
                  onChange={(e) =>
                    updateBlock(block.id, { title: e.target.value })
                  }
                  placeholder={
                    block.kind === "code"
                      ? "Snippet title"
                      : block.kind === "list"
                        ? "List title"
                        : "Heading"
                  }
                  aria-label="Section title"
                />
                <div className="scratch-block-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => moveBlock(block.id, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    Up
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => moveBlock(block.id, 1)}
                    disabled={index === blocks.length - 1}
                    aria-label="Move down"
                  >
                    Down
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    disabled={blocks.length === 1}
                    aria-label="Remove section"
                  >
                    Remove
                  </button>
                </div>
              </header>

              {block.kind === "list" ? (
                <ListEditor
                  lines={parseListLines(block.body)}
                  onChange={(lines) => updateList(block.id, lines)}
                />
              ) : (
                <textarea
                  className={`scratch-body${block.kind === "code" ? " code" : ""}`}
                  value={block.body}
                  onChange={(e) =>
                    updateBlock(block.id, { body: e.target.value })
                  }
                  placeholder={
                    block.kind === "code"
                      ? "Paste SQL or a snippet..."
                      : "Write freely. This stays on the paper."
                  }
                  rows={block.kind === "code" ? 8 : 5}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ListEditor({
  lines,
  onChange,
}: {
  lines: ListLine[];
  onChange: (lines: ListLine[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  function focusLine(index: number) {
    requestAnimationFrame(() => {
      const inputs =
        rootRef.current?.querySelectorAll<HTMLInputElement>(
          ".scratch-list-input"
        );
      inputs?.[index]?.focus();
    });
  }

  function setLine(index: number, patch: Partial<ListLine>) {
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...lines];
      next.splice(index + 1, 0, { done: false, text: "" });
      onChange(next);
      focusLine(index + 1);
      return;
    }
    if (e.key === "Backspace" && lines[index].text === "" && lines.length > 1) {
      e.preventDefault();
      onChange(lines.filter((_, i) => i !== index));
      focusLine(Math.max(0, index - 1));
    }
  }

  return (
    <div className="scratch-list" ref={rootRef}>
      {lines.map((line, index) => (
        <label key={index} className="scratch-list-row">
          <input
            type="checkbox"
            checked={line.done}
            onChange={(e) => setLine(index, { done: e.target.checked })}
          />
          <input
            className={`scratch-list-input${line.done ? " done" : ""}`}
            value={line.text}
            onChange={(e) => setLine(index, { text: e.target.value })}
            onKeyDown={(e) => onKeyDown(index, e)}
            placeholder="List item"
          />
        </label>
      ))}
    </div>
  );
}

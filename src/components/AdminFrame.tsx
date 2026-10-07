"use client";

import { FormEvent, useState } from "react";

export type AppPage =
  | "dashboard"
  | "analytics"
  | "capture"
  | "logs"
  | "projects"
  | "scratch";

const NAV: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "Board" },
  { id: "analytics", label: "Analytics" },
  { id: "capture", label: "New log" },
  { id: "logs", label: "Logs" },
  { id: "scratch", label: "Scratch" },
  { id: "projects", label: "Projects" },
];

const WIDGET_PAGES: AppPage[] = [
  "capture",
  "logs",
  "analytics",
  "scratch",
  "dashboard",
  "projects",
];

function initials(email?: string | null) {
  const local = email?.split("@")[0] || "";
  const parts = local.split(/[.\s_-]+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || "D"}${parts[1]?.[0] || ""}`;
  return letters.slice(0, 2).toUpperCase();
}

function widgetGlyph(page: AppPage) {
  if (page === "capture") return "＋";
  if (page === "logs") return "☰";
  if (page === "analytics") return "▦";
  if (page === "scratch") return "✎";
  if (page === "dashboard") return "◈";
  return "▣";
}

export default function AdminFrame({
  widgetMode,
  page,
  title,
  email,
  openCount,
  onNavigate,
  onSearch,
  onSignOut,
  children,
}: {
  widgetMode: boolean;
  page: AppPage;
  title: string;
  email?: string | null;
  openCount: number;
  onNavigate: (page: AppPage) => void;
  onSearch?: (query: string) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onSearch?.(search.trim());
  }

  function go(next: AppPage) {
    setOpen(false);
    onNavigate(next);
  }

  if (widgetMode) {
    return (
      <div className="shell shell--widget">
        <nav className="widget-nav" aria-label="Primary">
          {WIDGET_PAGES.map((id) => (
            <button
              key={id}
              type="button"
              className={`widget-nav-btn${page === id ? " active" : ""}`}
              onClick={() => onNavigate(id)}
              aria-label={id}
            >
              {widgetGlyph(id)}
            </button>
          ))}
        </nav>
        <main className="stage">{children}</main>
      </div>
    );
  }

  return (
    <div className="desk">
      <div className="desk-frame">
        <header className="desk-top">
          <button
            type="button"
            className="desk-brand"
            onClick={() => go("dashboard")}
          >
            <span className="masthead-mark" aria-hidden>
              D
            </span>
            <strong>DEVLOG</strong>
          </button>

          <form className="desk-search" onSubmit={submitSearch}>
            <span aria-hidden>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              aria-label="Search logs"
            />
          </form>

          <div className="desk-tools">
            <span className="desk-avatar" title={email || "Signed in"}>
              {initials(email)}
            </span>
            <button
              type="button"
              className="btn desk-add"
              onClick={() => go("capture")}
            >
              + New log
            </button>
            <button type="button" className="desk-signout" onClick={onSignOut}>
              Sign out
            </button>
            <button
              type="button"
              className="menu-btn"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>

          <nav
            className={`desk-nav${open ? " desk-nav--open" : ""}`}
            aria-label="Primary"
          >
            {NAV.map((item) => {
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`desk-link${active ? " desk-link--active" : ""}`}
                  onClick={() => go(item.id)}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                  {item.id === "dashboard" && openCount > 0 ? (
                    <span className="desk-count">{openCount}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>
        <main className="stage">{children}</main>
      </div>
    </div>
  );
}

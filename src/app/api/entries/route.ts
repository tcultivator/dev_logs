import { NextResponse } from "next/server";
import {
  DEFAULT_ENTRY_TYPE,
  ENTRY_TYPE_VALUES,
  EntryType,
  TICKET_STATUS_VALUES,
  TicketStatus,
  endOfDay,
  isTicketType,
  parseLocalDate,
  startOfDay,
} from "@/lib/entries";
import { createEntry, listEntries } from "@/lib/models";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const typeParam = searchParams.get("type");
    const statusParam = searchParams.get("status");
    const projectId = searchParams.get("projectId") || undefined;
    const today = searchParams.get("today") === "1";
    const date = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dateFieldParam = searchParams.get("dateField");

    const type =
      typeParam && ENTRY_TYPE_VALUES.includes(typeParam as EntryType)
        ? typeParam
        : undefined;

    let status: TicketStatus | TicketStatus[] | undefined;
    if (statusParam) {
      if (statusParam === "open") {
        status = ["OPEN", "IN_PROGRESS"];
      } else {
        const parts = statusParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as TicketStatus[];
        const valid = parts.filter((s) =>
          TICKET_STATUS_VALUES.includes(s)
        );
        if (valid.length === 1) status = valid[0];
        else if (valid.length > 1) status = valid;
      }
    }

    const dateField =
      dateFieldParam === "resolved_at" ? "resolved_at" : "created_at";

    let from: Date | undefined;
    let to: Date | undefined;

    if (fromParam || toParam) {
      const start = parseLocalDate(fromParam || toParam || toInputFallback());
      const end = parseLocalDate(toParam || fromParam || toInputFallback());
      from = startOfDay(start <= end ? start : end);
      to = endOfDay(start <= end ? end : start);
    } else if (today || date) {
      const base = date ? parseLocalDate(date) : new Date();
      from = startOfDay(base);
      to = endOfDay(base);
    }

    const entries = await listEntries({
      q,
      type,
      status,
      projectId,
      from,
      to,
      dateField,
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error. Is MySQL running and .env correct?" },
      { status: 500 }
    );
  }
}

function toInputFallback() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const content = String(body.body || "").trim();
    const type = (body.type as EntryType) || DEFAULT_ENTRY_TYPE;
    const tags = body.tags ? String(body.tags).trim() : null;
    const projectId = body.projectId || null;
    const status =
      body.status && TICKET_STATUS_VALUES.includes(body.status)
        ? (body.status as TicketStatus)
        : undefined;

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: "title, body, and type are required" },
        { status: 400 }
      );
    }

    if (!ENTRY_TYPE_VALUES.includes(type)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }

    if (isTicketType(type) && !projectId) {
      return NextResponse.json(
        { error: "project is required for tickets" },
        { status: 400 }
      );
    }

    const entry = await createEntry({
      title,
      body: content,
      type,
      tags,
      projectId,
      status,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error while creating entry" },
      { status: 500 }
    );
  }
}

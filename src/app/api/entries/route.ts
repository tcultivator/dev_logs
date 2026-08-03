import { NextResponse } from "next/server";
import {
  ENTRY_TYPE_VALUES,
  EntryType,
  endOfDay,
  parseLocalDate,
  startOfDay,
} from "@/lib/entries";
import { createEntry, listEntries } from "@/lib/models";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const typeParam = searchParams.get("type");
    const projectId = searchParams.get("projectId") || undefined;
    const today = searchParams.get("today") === "1";
    const date = searchParams.get("date");

    const type =
      typeParam && ENTRY_TYPE_VALUES.includes(typeParam as EntryType)
        ? typeParam
        : undefined;

    let from: Date | undefined;
    let to: Date | undefined;
    if (today || date) {
      const base = date ? parseLocalDate(date) : new Date();
      from = startOfDay(base);
      to = endOfDay(base);
    }

    const entries = await listEntries({ q, type, projectId, from, to });
    return NextResponse.json(entries);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error. Is MySQL running and .env correct?" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const content = String(body.body || "").trim();
    const type = body.type as EntryType;
    const tags = body.tags ? String(body.tags).trim() : null;
    const projectId = body.projectId || null;

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: "title, body, and type are required" },
        { status: 400 }
      );
    }

    if (!ENTRY_TYPE_VALUES.includes(type)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }

    const entry = await createEntry({
      title,
      body: content,
      type,
      tags,
      projectId,
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

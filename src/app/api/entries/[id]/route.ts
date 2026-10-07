import { NextResponse } from "next/server";
import {
  ENTRY_TYPE_VALUES,
  EntryType,
  TICKET_STATUS_VALUES,
  TicketStatus,
  isTicketType,
  parseLoggedOn,
} from "@/lib/entries";
import { deleteEntry, getEntry, updateEntry } from "@/lib/models";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const current = await getEntry(user.id, id);
    if (!current) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const data: Partial<{
      title: string;
      body: string;
      type: EntryType;
      tags: string | null;
      done: boolean;
      status: TicketStatus | null;
      projectId: string | null;
      loggedOn: Date;
    }> = {};

    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.body === "string") data.body = body.body.trim();
    if (typeof body.tags === "string") data.tags = body.tags.trim() || null;
    if (typeof body.done === "boolean") data.done = body.done;
    if (body.projectId === null || typeof body.projectId === "string") {
      data.projectId = body.projectId || null;
    }
    if (body.type && ENTRY_TYPE_VALUES.includes(body.type)) {
      data.type = body.type;
    }
    if (body.status === null) {
      data.status = null;
    } else if (
      typeof body.status === "string" &&
      TICKET_STATUS_VALUES.includes(body.status as TicketStatus)
    ) {
      data.status = body.status as TicketStatus;
    }
    if (typeof body.loggedOn === "string" && body.loggedOn) {
      const loggedOn = parseLoggedOn(body.loggedOn);
      if (!loggedOn.ok) {
        return NextResponse.json({ error: loggedOn.error }, { status: 400 });
      }
      data.loggedOn = loggedOn.date;
    }

    const nextType = data.type ?? current.type;
    const nextProjectId =
      data.projectId !== undefined ? data.projectId : current.projectId;

    if (isTicketType(nextType) && !nextProjectId) {
      return NextResponse.json(
        { error: "project is required for logs" },
        { status: 400 }
      );
    }

    const entry = await updateEntry(user.id, id, data);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Database error while updating entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ok = await deleteEntry(user.id, id);
    if (!ok) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error while deleting entry" },
      { status: 500 }
    );
  }
}

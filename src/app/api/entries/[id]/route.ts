import { NextResponse } from "next/server";
import { ENTRY_TYPE_VALUES, EntryType } from "@/lib/entries";
import { deleteEntry, updateEntry } from "@/lib/models";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Partial<{
      title: string;
      body: string;
      type: EntryType;
      tags: string | null;
      done: boolean;
      projectId: string | null;
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

    const entry = await updateEntry(id, data);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error while updating entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ok = await deleteEntry(id);
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

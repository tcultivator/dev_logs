import { NextResponse } from "next/server";
import { deleteReportFormat } from "@/lib/formats";
import { requireUser } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const removed = await deleteReportFormat(user.id, id);
    if (!removed) {
      return NextResponse.json({ error: "Format not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Database error while deleting the format." },
      { status: 500 }
    );
  }
}

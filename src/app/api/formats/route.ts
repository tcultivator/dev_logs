import { NextResponse } from "next/server";
import { createReportFormat, listReportFormats } from "@/lib/formats";
import { ReportFormatInput } from "@/lib/report-format";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const formats = await listReportFormats(user.id);
    return NextResponse.json(formats);
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
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ReportFormatInput;
    const created = await createReportFormat(user.id, body);
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }
    return NextResponse.json(created.format, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = String(error);
    if (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY")) {
      return NextResponse.json(
        { error: "A format with that name already exists." },
        { status: 409 }
      );
    }
    if (message.includes("report_formats")) {
      return NextResponse.json(
        { error: "Format storage is not ready. Apply sql/migrate-formats.sql." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Database error while saving the format." },
      { status: 500 }
    );
  }
}

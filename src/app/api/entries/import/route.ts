import { NextResponse } from "next/server";
import { saveAccomplishmentImport } from "@/lib/accomplishment-import";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const text = String(body.text || "");
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Paste a daily accomplishment first." },
        { status: 400 }
      );
    }

    const result = await saveAccomplishmentImport(user.id, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not create logs from that accomplishment." },
      { status: 500 }
    );
  }
}

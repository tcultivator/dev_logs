import { NextResponse } from "next/server";
import { extractFormatFromDocx } from "@/lib/docx-format";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a Word document." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json(
        { error: "Upload a .docx Word document." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That document is larger than 8 MB." },
        { status: 400 }
      );
    }

    const format = await extractFormatFromDocx(await file.arrayBuffer(), file.name);
    return NextResponse.json(format);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Could not read that document.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

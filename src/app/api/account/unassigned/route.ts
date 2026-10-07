import { NextResponse } from "next/server";
import { claimUnassigned, countUnassigned } from "@/lib/models";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(await countUnassigned());
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not check unassigned logs" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await claimUnassigned(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    const message = String(error);
    if (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY")) {
      return NextResponse.json(
        {
          error:
            "An unassigned project uses a name you already have. Rename yours, then try again.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Could not attach the old logs" },
      { status: 500 }
    );
  }
}

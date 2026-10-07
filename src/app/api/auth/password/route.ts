import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findUserById, hasPassword, setInitialPassword } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.authType !== "google") {
      return NextResponse.json(
        { error: "Only Google accounts set a password here." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const password = String(body.password || "");
    const confirm = String(body.confirm || "");

    if (password.length < 8 || password.length > 72) {
      return NextResponse.json(
        { error: "Use a password between 8 and 72 characters." },
        { status: 400 }
      );
    }
    if (password !== confirm) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 }
      );
    }

    const user = await findUserById(session.user.id);
    if (!user || user.auth_type !== "google") {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (hasPassword(user)) {
      return NextResponse.json(
        { error: "A password is already set for this account." },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);
    const saved = await setInitialPassword(user.id, passwordHash);
    if (!saved) {
      return NextResponse.json(
        { error: "A password is already set for this account." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not save the password." },
      { status: 500 }
    );
  }
}

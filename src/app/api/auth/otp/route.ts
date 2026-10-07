import { NextResponse } from "next/server";
import { requestOtp, type OtpPurpose } from "@/lib/otp";
import { findUserByEmail, isEmail, normalizeEmail } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email || ""));
    const purpose: OtpPurpose = body.purpose === "signup" ? "signup" : "signin";

    if (!isEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);

    if (purpose === "signup") {
      if (existing?.auth_type === "google") {
        return NextResponse.json(
          {
            error:
              "This email is already registered with Google. Sign in with Google. Email signup cannot take over that account.",
          },
          { status: 409 }
        );
      }
      if (existing) {
        return NextResponse.json(
          { error: "This email already has an account. Sign in with an email code." },
          { status: 409 }
        );
      }
    } else if (!existing) {
      return NextResponse.json(
        { error: "No account for that email. Create one first." },
        { status: 404 }
      );
    } else if (existing.auth_type === "google") {
      return NextResponse.json(
        {
          error:
            "This email uses Google sign-in. Email codes are only for manual accounts. If you already set a password, use password sign-in.",
        },
        { status: 409 }
      );
    }

    const result = await requestOtp(email, purpose);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      devCode: result.devCode,
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error && error.message === "Email is not configured"
        ? "Email sending is not set up yet."
        : "Could not send the code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

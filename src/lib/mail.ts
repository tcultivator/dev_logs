import nodemailer from "nodemailer";

export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "signup" | "signin"
) {
  const subject =
    purpose === "signup" ? "Your DevLog signup code" : "Your DevLog sign-in code";
  const text = `Your DevLog code is ${code}. It expires in 10 minutes.`;

  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email is not configured");
    }
    console.log(`[devlog] OTP for ${to} (${purpose}): ${code}`);
    return { delivered: false as const };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });

  return { delivered: true as const };
}

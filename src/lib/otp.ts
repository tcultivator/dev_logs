import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { RowDataPacket } from "mysql2";
import { execute, query } from "@/lib/db";
import { sendOtpEmail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/users";

export type OtpPurpose = "signup" | "signin";

type OtpRow = RowDataPacket & {
  id: string;
  email: string;
  code_hash: string;
  purpose: OtpPurpose;
  attempts: number;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string) {
  const secret = process.env.AUTH_SECRET || "";
  return createHash("sha256").update(`${secret}|${email}|${code}`).digest("hex");
}

function sameHash(stored: string, next: string) {
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(next, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestOtp(emailInput: string, purpose: OtpPurpose) {
  const email = normalizeEmail(emailInput);

  const recent = await query<OtpRow[]>(
    `SELECT id, created_at
     FROM email_otps
     WHERE email = :email
     ORDER BY created_at DESC
     LIMIT 1`,
    { email }
  );
  const last = recent[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false as const, error: "Wait a minute before requesting another code." };
  }

  await execute(
    `DELETE FROM email_otps
     WHERE email = :email AND (expires_at < NOW(3) OR used_at IS NOT NULL)`,
    { email }
  );
  await execute(
    `UPDATE email_otps
     SET used_at = NOW(3)
     WHERE email = :email AND purpose = :purpose AND used_at IS NULL`,
    { email, purpose }
  );

  const code = generateOtpCode();
  await execute(
    `INSERT INTO email_otps (id, email, code_hash, purpose, expires_at)
     VALUES (:id, :email, :codeHash, :purpose, :expiresAt)`,
    {
      id: randomUUID(),
      email,
      codeHash: hashCode(email, code),
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    }
  );

  const sent = await sendOtpEmail(email, code, purpose);
  return {
    ok: true as const,
    delivered: sent.delivered,
    devCode: sent.delivered ? undefined : code,
  };
}

export async function consumeOtp(
  emailInput: string,
  code: string,
  purpose: OtpPurpose
) {
  const email = normalizeEmail(emailInput);
  const rows = await query<OtpRow[]>(
    `SELECT id, code_hash, attempts
     FROM email_otps
     WHERE email = :email
       AND purpose = :purpose
       AND used_at IS NULL
       AND expires_at > NOW(3)
     ORDER BY created_at DESC
     LIMIT 1`,
    { email, purpose }
  );
  const row = rows[0];
  if (!row) return { ok: false as const };

  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    await execute(`UPDATE email_otps SET used_at = NOW(3) WHERE id = :id`, {
      id: row.id,
    });
    return { ok: false as const };
  }

  if (!sameHash(row.code_hash, hashCode(email, code.trim()))) {
    const attempts = Number(row.attempts) + 1;
    await execute(
      `UPDATE email_otps
       SET attempts = :attempts,
           used_at = IF(:attemptCount >= :maxAttempts, NOW(3), used_at)
       WHERE id = :id`,
      {
        id: row.id,
        attempts,
        attemptCount: attempts,
        maxAttempts: MAX_ATTEMPTS,
      }
    );
    return { ok: false as const };
  }

  await execute(`UPDATE email_otps SET used_at = NOW(3) WHERE id = :id`, {
    id: row.id,
  });
  return { ok: true as const };
}

import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import { execute, query } from "@/lib/db";

export type AuthType = "google" | "gmail";

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  auth_type: AuthType;
  created_at: Date;
  updated_at: Date;
};

type UserRow = RowDataPacket & UserRecord;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function findUserByEmail(email: string) {
  const rows = await query<UserRow[]>(
    `SELECT id, email, name, image, password_hash, auth_type, created_at, updated_at
     FROM users
     WHERE email = :email
     LIMIT 1`,
    { email: normalizeEmail(email) }
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const rows = await query<UserRow[]>(
    `SELECT id, email, name, image, password_hash, auth_type, created_at, updated_at
     FROM users
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  authType: AuthType;
  passwordHash?: string | null;
}) {
  const id = randomUUID();
  const email = normalizeEmail(input.email);
  await execute(
    `INSERT INTO users (id, email, name, image, password_hash, auth_type)
     VALUES (:id, :email, :name, :image, :passwordHash, :authType)`,
    {
      id,
      email,
      name: input.name ?? null,
      image: input.image ?? null,
      passwordHash: input.passwordHash ?? null,
      authType: input.authType,
    }
  );
  const user = await findUserById(id);
  if (!user) throw new Error("Could not create user");
  return user;
}

export function hasPassword(user: { password_hash: string | null }) {
  return typeof user.password_hash === "string" && user.password_hash.length > 0;
}

/** Sets a password only while the Google account still has none. */
export async function setInitialPassword(id: string, passwordHash: string) {
  const result = await execute(
    `UPDATE users
     SET password_hash = :passwordHash
     WHERE id = :id
       AND auth_type = 'google'
       AND password_hash IS NULL`,
    { id, passwordHash }
  );
  return result.affectedRows > 0;
}

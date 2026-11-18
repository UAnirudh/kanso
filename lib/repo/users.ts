import { getDb, newId, nowIso } from "../db";
import { hashPassword } from "../auth";
import { HttpError } from "../errors";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(email: string): UserRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserById(id: string): UserRecord | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(input: {
  email: string;
  name: string;
  password: string;
}): UserRecord {
  const email = normalizeEmail(input.email);
  if (findUserByEmail(email)) {
    throw new HttpError(409, "An account with that email already exists.");
  }
  const user: UserRecord = {
    id: newId("usr"),
    email,
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
    createdAt: nowIso(),
  };
  getDb()
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(user.id, user.email, user.name, user.passwordHash, user.createdAt);
  return user;
}

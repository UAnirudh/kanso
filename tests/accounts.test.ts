import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The promise of accounts is that identity stops belonging to a browser: the
 * interface documents and workspace role attached to a guest must survive being
 * claimed, and must be reachable from a different device with the same
 * credentials. These tests assert that against a real migrated SQLite file.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-accounts-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let guests: typeof import("@/lib/repo/guests");
let workspaces: typeof import("@/lib/repo/workspaces");
let accounts: typeof import("@/lib/repo/accounts");
let generation: typeof import("@/lib/services/generation");
let HttpError: typeof import("@/lib/errors").HttpError;

let workspaceId: string;
let claimedId: string;

beforeAll(async () => {
  db = await import("@/lib/db");
  guests = await import("@/lib/repo/guests");
  workspaces = await import("@/lib/repo/workspaces");
  accounts = await import("@/lib/repo/accounts");
  generation = await import("@/lib/services/generation");
  HttpError = (await import("@/lib/errors")).HttpError;

  workspaceId = workspaces.ensureSharedWorkspace();
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function device(seed: string): string {
  return seed.repeat(32).slice(0, 32);
}

describe("claiming a guest identity", () => {
  it("keeps the row id, its interface document and its role", () => {
    const guest = guests.resolveGuest(device("a"));
    const app = generation.generateApplication({
      userId: guest.id,
      workspaceId,
      prompt: "A project workspace with a kanban board",
      name: "Claimed app",
    }).app;

    const before = db
      .getDb()
      .prepare("SELECT COUNT(*) AS count FROM user_interfaces WHERE app_id = ? AND user_id = ?")
      .get(app.id, guest.id) as { count: number };
    expect(before.count).toBe(1);

    const account = accounts.claimAccount({
      userId: guest.id,
      email: "  Person@Example.com ",
      password: "correct horse battery",
      name: "Person",
    });

    claimedId = account.id;
    expect(account.id).toBe(guest.id);
    expect(account.email).toBe("person@example.com");
    expect(workspaces.getMembership(workspaceId, account.id)).toBe("admin");

    // The same personal interface row is still owned by the same user id.
    const after = db
      .getDb()
      .prepare("SELECT COUNT(*) AS count FROM user_interfaces WHERE app_id = ? AND user_id = ?")
      .get(app.id, guest.id) as { count: number };
    expect(after.count).toBe(1);

    // The row belongs to the account now, not to one browser.
    const row = db
      .getDb()
      .prepare("SELECT device_id AS deviceId, email FROM users WHERE id = ?")
      .get(guest.id) as { deviceId: string | null; email: string | null };
    expect(row).toEqual({ deviceId: null, email: "person@example.com" });
  });

  it("resolves the same identity from another device with the password", () => {
    // A fresh process holding only the credentials reaches the same row: the
    // device id was cleared on claim, so this really is "another device".
    const account = accounts.authenticate("person@example.com", "correct horse battery");
    expect(account?.id).toBe(claimedId);
    expect(guests.resolveGuest(device("a")).id).not.toBe(claimedId);
    expect(account && workspaces.getMembership(workspaceId, account.id)).toBe("admin");
  });

  it("fails the same way for a wrong password and an unknown email", () => {
    expect(accounts.authenticate("person@example.com", "wrong password")).toBeNull();
    expect(accounts.authenticate("nobody@example.com", "correct horse battery")).toBeNull();
  });

  it("refuses an email another row already claimed", () => {
    const other = guests.resolveGuest(device("b"));
    expect(() =>
      accounts.claimAccount({
        userId: other.id,
        email: "person@example.com",
        password: "another password",
      }),
    ).toThrow(HttpError);
    // The rejected claim leaves the guest exactly as it was.
    expect(workspaces.getMembership(workspaceId, other.id)).toBe("admin");
  });

  it("creates a working account when the visitor had no guest identity", () => {
    const account = accounts.claimAccount({
      userId: null,
      email: "fresh@example.com",
      password: "a fresh password",
    });
    expect(account.name).toBe("fresh");
    expect(workspaces.getMembership(workspaceId, account.id)).toBe("admin");
    expect(accounts.authenticate("fresh@example.com", "a fresh password")?.id).toBe(account.id);
  });
});

describe("credential attempt budgets", () => {
  it("throttles sign-in per email in a sliding window", () => {
    const start = Date.UTC(2026, 0, 1);
    for (let attempt = 0; attempt < accounts.SIGN_IN_ATTEMPT_LIMIT; attempt += 1) {
      expect(() => accounts.assertSignInAllowed("limited@example.com", start + attempt)).not.toThrow();
    }

    const blocked = () => accounts.assertSignInAllowed("limited@example.com", start + 10);
    expect(blocked).toThrow(HttpError);
    expect(blocked).toThrow(/Too many sign-in attempts/);
    try {
      blocked();
    } catch (error) {
      expect((error as InstanceType<typeof HttpError>).status).toBe(429);
    }

    // Another address has its own budget, and the window eventually slides.
    expect(() => accounts.assertSignInAllowed("other@example.com", start + 10)).not.toThrow();
    expect(() =>
      accounts.assertSignInAllowed("limited@example.com", start + accounts.SIGN_IN_WINDOW_MS + 1),
    ).not.toThrow();
  });

  it("keeps sign-up attempts in a separate, stricter bucket", () => {
    const start = Date.UTC(2026, 0, 2);
    for (let attempt = 0; attempt < accounts.SIGN_UP_ATTEMPT_LIMIT; attempt += 1) {
      expect(() => accounts.assertSignUpAllowed("new@example.com", start + attempt)).not.toThrow();
    }
    expect(() => accounts.assertSignUpAllowed("new@example.com", start + 10)).toThrow(HttpError);

    // A full sign-up bucket does not consume the sign-in budget.
    expect(() => accounts.assertSignInAllowed("new@example.com", start + 10)).not.toThrow();
  });

  it("throttles a whole network spreading guesses across addresses", () => {
    const start = Date.UTC(2026, 0, 4);
    const origin = "203.0.113.7";

    // One attempt per address defeats the per-email budget, but not this one.
    for (let attempt = 0; attempt < accounts.SIGN_IN_ORIGIN_LIMIT; attempt += 1) {
      expect(() => accounts.assertSignInOriginAllowed(origin, start + attempt)).not.toThrow();
    }
    expect(() => accounts.assertSignInOriginAllowed(origin, start + 30)).toThrow(
      /Too many sign-in attempts from this network/,
    );

    // Another network keeps its own budget, and the window slides.
    expect(() => accounts.assertSignInOriginAllowed("198.51.100.4", start + 30)).not.toThrow();
    expect(() =>
      accounts.assertSignInOriginAllowed(origin, start + accounts.SIGN_IN_WINDOW_MS + 1),
    ).not.toThrow();
  });

  it("keeps the origin budget separate from any single address", () => {
    const start = Date.UTC(2026, 0, 5);
    const origin = "203.0.113.9";

    for (let attempt = 0; attempt < accounts.SIGN_IN_ATTEMPT_LIMIT; attempt += 1) {
      accounts.assertSignInAllowed("one@example.com", start + attempt);
      accounts.assertSignInOriginAllowed(origin, start + attempt);
    }

    // The address is exhausted but the network is not...
    expect(() => accounts.assertSignInAllowed("one@example.com", start + 10)).toThrow(HttpError);
    expect(() => accounts.assertSignInOriginAllowed(origin, start + 10)).not.toThrow();
    // ...and an untouched address on that network still has its own budget.
    expect(() => accounts.assertSignInAllowed("two@example.com", start + 10)).not.toThrow();
  });

  it("ignores the case an attempt was typed in", () => {
    const start = Date.UTC(2026, 0, 3);
    for (let attempt = 0; attempt < accounts.SIGN_IN_ATTEMPT_LIMIT; attempt += 1) {
      accounts.assertSignInAllowed("Mixed@Example.com", start + attempt);
    }
    expect(() => accounts.assertSignInAllowed("mixed@example.COM", start + 10)).toThrow(HttpError);
  });
});

describe("sessions", () => {
  it("hash stored tokens and resolve to their account", () => {
    const account = accounts.authenticate("fresh@example.com", "a fresh password")!;
    const ticket = accounts.createSession(account.id);

    const stored = db
      .getDb()
      .prepare("SELECT id, user_id AS userId FROM sessions WHERE user_id = ?")
      .get(account.id) as { id: string; userId: string };
    expect(stored.id).not.toBe(ticket.token);
    expect(stored.userId).toBe(account.id);

    expect(accounts.resolveSession(ticket.token)?.id).toBe(account.id);
    accounts.revokeSession(ticket.token);
    expect(accounts.resolveSession(ticket.token)).toBeNull();
  });

  it("stops resolving once the session expires", () => {
    const account = accounts.authenticate("fresh@example.com", "a fresh password")!;
    const ticket = accounts.createSession(account.id);
    db.getDb()
      .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .run("2000-01-01T00:00:00.000Z", account.id);

    expect(accounts.resolveSession(ticket.token)).toBeNull();
    accounts.pruneExpiredSessions();
    const remaining = db
      .getDb()
      .prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?")
      .get(account.id) as { count: number };
    expect(remaining.count).toBe(0);
  });

  it("salts password hashes so equal passwords store differently", () => {
    const one = accounts.hashPassword("same password");
    const two = accounts.hashPassword("same password");
    expect(one).not.toBe(two);
    expect(accounts.verifyPassword("same password", one)).toBe(true);
    expect(accounts.verifyPassword("other password", one)).toBe(false);
    expect(accounts.verifyPassword("same password", "not-a-hash")).toBe(false);
  });
});

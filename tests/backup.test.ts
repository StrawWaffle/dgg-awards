import { describe, expect, test } from "bun:test";
import { decryptBackup, encryptBackup, isEncryptedBackup, isSqlite } from "@/lib/backup-crypto";
import { backupName, backupsToDelete } from "@/lib/backup-names";

// Off-site backups were encrypted until 2026-11-09; those still restore.
describe("encrypted backups", () => {
  const sqlite = new TextEncoder().encode("SQLite format 3\u0000" + "x".repeat(5000));

  test("round trip", async () => {
    const sealed = await encryptBackup(sqlite, "correct horse");
    expect(isEncryptedBackup(sealed)).toBe(true);
    expect(isSqlite(sealed)).toBe(false);
    expect(sealed.length).toBeLessThan(sqlite.length); // gzipped first
    expect(await decryptBackup(sealed, "correct horse")).toEqual(sqlite);
  });

  test("a wrong password or a damaged file is refused", async () => {
    const sealed = await encryptBackup(sqlite, "correct horse");
    await expect(decryptBackup(sealed, "wrong")).rejects.toThrow("wrong password");
    const damaged = new Uint8Array(sealed);
    damaged[damaged.length - 5]! ^= 1;
    await expect(decryptBackup(damaged, "correct horse")).rejects.toThrow("damaged");
    await expect(decryptBackup(sqlite, "correct horse")).rejects.toThrow("isn't an encrypted");
  });

  test("each backup is salted differently", async () => {
    const a = await encryptBackup(sqlite, "pw");
    const b = await encryptBackup(sqlite, "pw");
    expect(a).not.toEqual(b);
  });
});

describe("which backups are kept", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const hoursAgo = (h: number) => backupName(new Date(now - h * 3600_000));

  test("names sort by time", () => {
    expect(backupName(new Date("2026-11-09T19:42:31Z"))).toBe("dgg-awards-2026-11-09T19-42Z.db");
  });

  test("every copy for 2 days, then one a day for 60 days", () => {
    const hourly = Array.from({ length: 24 * 70 }, (_, h) => hoursAgo(h));
    const removed = new Set(backupsToDelete([...hourly, "notes.txt"], now));
    const kept = hourly.filter((n) => !removed.has(n));
    // 48 from the last two days, then one per day.
    expect(kept.slice(0, 48)).toEqual(hourly.slice(0, 48));
    const older = kept.slice(48);
    expect(new Set(older.map((n) => n.slice(11, 21))).size).toBe(older.length);
    expect(older.length).toBeGreaterThanOrEqual(57);
    expect(older.length).toBeLessThanOrEqual(59);
    // The newest of each day is the one kept.
    expect(older[0]).toBe(hoursAgo(48));
    expect(removed.has("notes.txt")).toBe(false);
    // The older, encrypted backups are kept by the same rule.
    expect(backupsToDelete(["dgg-awards-2026-08-01T10-00Z.db.enc"], now)).toEqual(["dgg-awards-2026-08-01T10-00Z.db.enc"]);
    expect(backupsToDelete(["dgg-awards-2026-11-09T10-00Z.db.enc"], now)).toEqual([]);
    expect(removed.has(hoursAgo(24 * 65))).toBe(true);
  });
});

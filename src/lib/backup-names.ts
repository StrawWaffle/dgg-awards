// Names of the off-site backup files, and which to keep.

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
/** Every backup is kept this long… */
const KEEP_ALL_FOR = 2 * DAY;
/** …then the newest of each day, this long. */
const KEEP_DAILY_FOR = 60 * DAY;

/** "dgg-awards-2026-11-09T19-42Z.db.enc", in UTC so names sort by time. */
export function backupName(at: Date) {
  return `dgg-awards-${at.toISOString().slice(0, 16).replace(":", "-")}Z.db.enc`;
}

function timeOf(name: string): number | null {
  const m = /^dgg-awards-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})Z\.db\.enc$/.exec(name);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) : null;
}

/**
 * Which backups to delete: keep everything from the last 2 days, then the
 * newest of each day for 60 days. Files not named like backups are left alone.
 */
export function backupsToDelete(names: string[], now: number): string[] {
  const dated = names
    .map((name) => ({ name, at: timeOf(name) }))
    .filter((b): b is { name: string; at: number } => b.at !== null)
    .sort((a, b) => b.at - a.at);
  const keptDays = new Set<string>();
  const remove: string[] = [];
  for (const b of dated) {
    const age = now - b.at;
    if (age < KEEP_ALL_FOR) continue;
    const day = new Date(b.at).toISOString().slice(0, 10);
    if (age < KEEP_DAILY_FOR && !keptDays.has(day)) keptDays.add(day);
    else remove.push(b.name);
  }
  return remove;
}

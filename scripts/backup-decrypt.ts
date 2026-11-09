// Decrypt an off-site backup (.db.enc from Google Drive) into a plain SQLite
// file, without the site running. The password is BACKUP_PASSWORD from the
// environment, or asked for.
//
//   bun scripts/backup-decrypt.ts dgg-awards-2026-11-09T19-42Z.db.enc sqlite.db
//
// The result can be restored in the admin page (Settings → Backups), or used
// as the database of a fresh install (see docs/migration.md).
import { decryptBackup } from "@/lib/backup-crypto";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: bun scripts/backup-decrypt.ts <backup.db.enc> <out.db>");
  process.exit(1);
}
const password = process.env.BACKUP_PASSWORD || prompt("Backup password:");
if (!password) {
  console.error("No password.");
  process.exit(1);
}
const data = await decryptBackup(new Uint8Array(await Bun.file(input).arrayBuffer()), password);
await Bun.write(output, data);
console.log(`Wrote ${output} (${Math.round(data.length / 1024)} kB).`);

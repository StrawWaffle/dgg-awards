// Encrypted database backups: what goes to Google Drive. The file is
//   "DGGABK1\n" | salt (16 bytes) | iv (12 bytes) | AES-256-GCM(gzip(sqlite))
// with the key derived from BACKUP_PASSWORD by PBKDF2-SHA256. GCM also
// catches a wrong password or a damaged file. Plain Web Crypto, so the app,
// scripts/backup-decrypt.ts and any Bun or browser can open one.

const MAGIC = new TextEncoder().encode("DGGABK1\n");
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** A copy on a plain ArrayBuffer, which is what Web Crypto takes. */
const own = (u: Uint8Array) => new Uint8Array(u) as Uint8Array<ArrayBuffer>;

async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: own(salt), iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Is this an encrypted backup (rather than a plain SQLite file)? */
export function isEncryptedBackup(data: Uint8Array) {
  return data.length > MAGIC.length && MAGIC.every((b, i) => data[i] === b);
}

/** Is this a plain SQLite database file? */
export function isSqlite(data: Uint8Array) {
  return new TextDecoder().decode(data.subarray(0, 15)) === "SQLite format 3";
}

export async function encryptBackup(sqlite: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error("No backup password.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(password, salt), own(Bun.gzipSync(own(sqlite)))),
  );
  const out = new Uint8Array(MAGIC.length + SALT_BYTES + IV_BYTES + sealed.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + SALT_BYTES);
  out.set(sealed, MAGIC.length + SALT_BYTES + IV_BYTES);
  return out;
}

/** The SQLite file inside an encrypted backup. Throws on a wrong password or a damaged file. */
export async function decryptBackup(data: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncryptedBackup(data)) throw new Error("That isn't an encrypted DGG Awards backup.");
  const salt = data.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = data.subarray(MAGIC.length + SALT_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
  const sealed = data.subarray(MAGIC.length + SALT_BYTES + IV_BYTES);
  let zipped: ArrayBuffer;
  try {
    zipped = await crypto.subtle.decrypt({ name: "AES-GCM", iv: own(iv) }, await keyFrom(password, salt), own(sealed));
  } catch {
    throw new Error("Couldn't decrypt the backup: wrong password, or the file is damaged.");
  }
  return Bun.gunzipSync(new Uint8Array(zipped));
}

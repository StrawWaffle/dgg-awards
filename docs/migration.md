# Backups and moving the site

Everything the site needs to come back, on another machine or with another maintainer, is in the Google Drive folder **DGG Awards backups**:

- `database/`: the database, encrypted, one file an hour (`dgg-awards-2026-11-09T19-42Z.db.enc`). Every copy is kept for 2 days, then one a day for 60 days.
- `media/`: clips and thumbnails, copied once a day. Not encrypted: they're public on the site anyway.

The backup password is needed to open a database backup. It's in the current maintainer's password manager, not in the folder.

What isn't in the folder, and where it is instead:

- **The code**: the GitHub repository.
- **Secrets** (destiny.gg app, tunnel token, R2 keys, `AUTH_SECRET`): each maintainer makes their own. See "Settings for a new install" below.
- **The video library** (`/data/library`): a copy of the collaborators' own Drive folder. Re-import it with `scripts/import-drive.py` (see the handoff).
- **Sign-in sessions**: never backed up. Everyone signs in again on a new install.

## Backups while the site runs

- **Off-site, every hour**: `src/server/backups.ts`, when `BACKUP_PASSWORD` and the `RCLONE_CONFIG_GDRIVE_*` settings are in `.env`. The admin page's Settings → Backups shows the last run and has "Back up now".
- **On the server**: a copy in `/data/backups/` before every import, restore and deploy (the newest 20 are kept).
- **By hand**: Settings → Backups → "Download a full backup" gives the database as a plain `.db` file. It holds voters' IP addresses, so keep it private.

### Setting up the off-site backups (once per maintainer)

1. Get [rclone](https://rclone.org/downloads/) on a computer with a browser and run:

   ```sh
   rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
   ```

   The second argument asks only for access to files rclone itself creates (`drive.file`), not the rest of the Drive. Sign in with the account the backups should go to.
2. rclone prints a block between `--->` and `<---End paste`. It's base64. Decode it: the JSON inside has a `token` field. That token's JSON goes in `.env`, in single quotes:

   ```sh
   RCLONE_CONFIG_GDRIVE_TYPE=drive
   RCLONE_CONFIG_GDRIVE_SCOPE=drive.file
   RCLONE_CONFIG_GDRIVE_TOKEN='{"access_token":"…","token_type":"Bearer","refresh_token":"…","expiry":"…"}'
   BACKUP_PASSWORD="a long passphrase"
   ```

   Optionally set `BACKUP_REMOTE` (default `gdrive:DGG Awards backups`).
3. Restart the app. The first backup runs a few minutes later.
4. To share the backups, share the folder from Google Drive. Send the password separately.

Backups made with the old password still need the old password. Note it down before changing it.

## Restoring

- **On a running site:** Settings → Backups → "Restore from a backup". Choose a `.db` or `.db.enc` file. An encrypted one uses the site's own password unless you enter another. Everything is replaced except sign-ins, and the current database is saved to `/data/backups/` first.
- **Without the site:** decrypt with `bun scripts/backup-decrypt.ts <file.db.enc> sqlite.db` (asks for the password, or reads `BACKUP_PASSWORD`). The result is a normal SQLite file.

A backup only restores onto the same version of the site: the same database updates (migrations) applied. To restore an older backup on newer code, start the older code (`git log` → the commit from the backup's date) with the backup as its database. Its migrations then run forward on the next start of the newer code.

## Moving to a new machine or maintainer

1. **Code:** clone the repository and install Docker.
2. **Settings:** copy `.env.example` to `.env` and fill it in (see the next section).
3. **Database:** take the newest file from `database/` and decrypt it:

   ```sh
   docker run --rm -v "$PWD:/w" -w /w -e BACKUP_PASSWORD oven/bun:1.4 \
     sh -c "bun install --frozen-lockfile >/dev/null && bun scripts/backup-decrypt.ts dgg-awards-….db.enc sqlite.db"
   ```

   Put it in the data volume before the first start:

   ```sh
   docker volume create dgg-awards_awards_data
   docker run --rm -v dgg-awards_awards_data:/data -v "$PWD:/w" alpine cp /w/sqlite.db /data/sqlite.db
   ```

   (Or start the site empty, sign in as an admin, and use Settings → Backups → Restore.)
4. **Media:** copy `media/` from Drive to wherever clips will live:
   - **On the server itself** (simplest): leave the `R2_*` settings empty and copy the folder into the volume's `media/` folder. For example, with rclone set up as above, run `rclone copy "gdrive:DGG Awards backups/media" <volume>/media`. The site serves them at `/files/…`.
   - **Your own bucket** (any S3-compatible storage: R2, Backblaze B2, AWS S3…): copy the files to its root and set the five `R2_*` settings to it. The stored names (`clips/…`, `thumbs/…`) are the same everywhere.
5. **Start:** `docker compose up -d --build app` (add `--profile tunnel` for a Cloudflare tunnel). Migrations run on start.
6. **Check:** sign in, open `/admin`, and check a nominee's clip plays. Then set up the off-site backups for yourself (above).

## Settings for a new install

| Setting | What |
|---|---|
| `DGG_CLIENT_ID`, `DGG_CLIENT_SECRET`, `DGG_REDIRECT` | A destiny.gg app (https://www.destiny.gg/profile/developer), redirect `https://<your site>/oauth` |
| `AUTH_SECRET` | Any long random string. Signs sessions. |
| `ADMIN_USERNAMES` | Comma-separated destiny.gg names that become admins on sign-in |
| `R2_*` | Optional: your bucket for clips (see Media above) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Optional: to publish through a Cloudflare tunnel |
| `BACKUP_PASSWORD`, `RCLONE_CONFIG_GDRIVE_*` | Off-site backups (above) |

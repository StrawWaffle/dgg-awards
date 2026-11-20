# Backups and moving the site

Everything the site needs to come back, on another machine or with another maintainer, is in the Google Drive folder **DGG Awards backups**:

- `database/`: the database, one plain SQLite file an hour (`dgg-awards-2026-11-09T19-42Z.db`). Every copy is kept for 2 days, then one a day for 60 days. They show who voted for what, so share the folder only with the organisers.
- `media/`: clips, thumbnails and announcer videos (the whole bucket), copied once a day. New files are added; nothing there is deleted.
- `archive/`: things to keep. `dgga25-original-source.zip` is the 2025 site's code as recovered, which this repository started from (code only: no database or secrets).

Until 2026-11-09 the database backups were encrypted (`.db.enc`) with a password, which StrawWaffle has. Those are deleted by the keeping rule within 60 days. Until then, they need that password to open (see Restoring).

What isn't in the folder, and where it is instead:

- **The code**: the GitHub repository (private; ask StrawWaffle for access).
- **Secrets** (destiny.gg app, tunnel token, R2 keys, `AUTH_SECRET`): each maintainer makes their own. See "Settings for a new install" below.
- **The video library** (`/data/library`): a copy of the collaborators' own Drive folder, used only to cut clips in the editor. Re-import it with `scripts/import-drive.py` (see the handoff). The site runs without it.
- **Sign-in sessions**: never backed up. Everyone signs in again on a new install.

Everything else set on the site is in the database, so the backups have it: awards, nominees and votes, the rounds and their dates, announcer video settings, the edit history, and the year in chat as edited on its page (the `pages` table; once edited, rebuilding `src/archive/chat-<year>.json` no longer changes it).

## Backups while the site runs

- **Off-site, every hour**: `src/server/backups.ts`, when the `RCLONE_CONFIG_GDRIVE_*` settings are in `.env`. The admin page's Settings → Backups shows the last run and has "Back up now".
- **On the server**: a copy in `/data/backups/` before every import, restore and data script, and one made by hand before each deploy (the newest 20 are kept).
- **By hand**: Settings → Backups → "Download a full backup" gives the database as a plain `.db` file. It shows who voted for what, so keep it private. (IP addresses and browsers are kept only when switched on in Settings → Privacy.)

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
   ```

   Optionally set `BACKUP_REMOTE` (default `gdrive:DGG Awards backups`).
3. Restart the app. The first backup runs a few minutes later.
4. To share the backups, share the folder from Google Drive.

The daily media copy reads the bucket through rclone set up for **Cloudflare R2**. On AWS S3 it fails (Settings → Backups shows the error) while the hourly database backups carry on. See "Clips on AWS S3 and CloudFront" below.

## Restoring

- **On a running site:** Settings → Backups → "Restore from a backup". Choose a `.db` file (or an older encrypted `.db.enc`: it uses `BACKUP_PASSWORD` from `.env` unless you enter its password). Everything is replaced except sign-ins, and the current database is saved to `/data/backups/` first.
- **Without the site:** a `.db` backup is a normal SQLite file. An older `.db.enc` decrypts with `bun scripts/backup-decrypt.ts <file.db.enc> sqlite.db` (asks for the password, or reads `BACKUP_PASSWORD`).

Restoring on a running site works only onto the same version of the site (the same database updates, or migrations, applied); otherwise it refuses. Putting the file in place before the first start (step 3 below) has no such limit: the site applies any newer updates to it when it starts. To restore an older backup over a newer running site, start the older code (`git log` → the commit from the backup's date) with the backup as its database; its migrations run forward on the next start of the newer code.

## Moving to a new machine or maintainer

What's needed:

- a server that runs Docker (`linux/amd64`; the image brings Bun, ffmpeg, yt-dlp and rclone itself) with a few GB of disk
- a domain with HTTPS in front of the app: a Cloudflare tunnel (built in), or your own reverse proxy
- a destiny.gg app for sign-in
- somewhere to keep clips and thumbnails: the server's disk, Cloudflare R2, or another S3 bucket
- the newest database backup and the clips (from the Drive folder, or straight from the current bucket)

Steps:

1. **Code:** clone the repository and install Docker.
2. **Settings:** copy `.env.example` to `.env` and fill it in (see the last section).
3. **Database (the import):** take the newest file from `database/`, or download one from the current site (Settings → Backups → "Download a full backup"), and save it as `sqlite.db`. Put it in the data volume before the first start. Docker Compose names the volume after the folder you cloned into, `<folder>_awards_data` (`dgg-awards_awards_data` for a folder called `dgg-awards`):

   ```sh
   docker volume create dgg-awards_awards_data
   docker run --rm -v dgg-awards_awards_data:/data -v "$PWD:/w" alpine cp /w/sqlite.db /data/sqlite.db
   ```

   (Or start the site empty, sign in as an admin, and use Settings → Backups → Restore, which needs the same version of the code as the backup.)
4. **Media:** the stored names (`clips/…`, `thumbs/…`, `announcers/…`) are the same in every kind of storage, so copy the files as they are, to the root:
   - **On the server itself** (simplest; fine for testing): leave the `R2_*` settings empty and copy `media/` into the volume's `media/` folder:

     ```sh
     docker run --rm -v dgg-awards_awards_data:/data -v "$PWD/media:/m" alpine sh -c "mkdir -p /data/media && cp -r /m/. /data/media/"
     ```

     The site serves them at `/files/…`. Not for the night of the stream: one server's connection can't carry thousands of viewers' video.
   - **Cloudflare R2** (what the site uses now; bandwidth is free, and this year's clips fit the free tier): make a bucket, give it a public custom domain, make an API token with Object Read & Write on that bucket only, copy the files in, and set the five `R2_*` settings.
   - **AWS S3 with CloudFront:** see the next section.
5. **Start:** `docker compose up -d --build app` (add `--profile tunnel` for a Cloudflare tunnel). Migrations run on start. The app listens only on `127.0.0.1:3000`, so the tunnel or your reverse proxy publishes it.
6. **Check:** sign in, open `/admin`, and check a nominee's clip plays. Then set up the off-site backups for yourself (above).

Votes come in during the voting, so move the site before voting opens or after it closes, and take the database backup right before.

### Exporting the clips from the current bucket

The Drive folder's `media/` is at most a day old. To copy the live bucket instead, ask StrawWaffle for a read-only R2 token and use rclone on any computer:

```sh
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=<key id> RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<secret>
rclone copy r2:<bucket> ./media
```

Then into an S3 bucket: `aws s3 sync ./media s3://<your bucket>/` (it sets each file's type from its extension).

### Clips on AWS S3 and CloudFront

The storage code uses Bun's S3 client, which works with any S3-compatible service; the settings keep their `R2_` names:

| Setting | AWS value |
|---|---|
| `R2_ENDPOINT` | `https://s3.<region>.amazonaws.com` (Bun takes the region from it) |
| `R2_BUCKET` | the bucket's name |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | an IAM user's keys, allowed `s3:PutObject` and `s3:DeleteObject` on that bucket (plus `s3:GetObject` and `s3:ListBucket` for the media backup) |
| `R2_PUBLIC_URL` | the CloudFront distribution's address (`https://dxxxx.cloudfront.net`, or your own domain) with the bucket as its origin |

The bucket can stay private behind CloudFront's origin access control. CloudFront passes byte ranges through, which seeking in video needs. Clips play in a plain `<video>` tag, so the bucket needs no CORS rules.

How it differs from R2:

- **Cost:** CloudFront charges for bandwidth after its free tier; R2 doesn't. A clip is about 4 MB, and thousands of viewers watch them on stream night. Keeping the clips on R2 while everything else moves is a settings change only.
- **Untested:** the site has run only on R2 and on local disk. Build a clip in the editor and play it before relying on it.
- **The daily media copy to Drive** is set up for R2 and fails on AWS until `backupMediaOffsite` in `src/server/backups.ts` uses rclone's AWS provider for AWS endpoints. The database backups are unaffected.

## Settings for a new install

| Setting | What |
|---|---|
| `DGG_CLIENT_ID`, `DGG_CLIENT_SECRET`, `DGG_REDIRECT` | A destiny.gg app (https://www.destiny.gg/profile/developer), redirect `https://<your site>/oauth` |
| `DGG_ORIGIN` | `https://www.destiny.gg` |
| `AUTH_SECRET` | Any long random string. Signs sessions. |
| `ADMIN_USERNAMES` | Comma-separated destiny.gg names that become admins on sign-in |
| `R2_*` | Optional: your bucket for clips (see Media above). All five, or none for the server's disk. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Optional: to publish through a Cloudflare tunnel |
| `RCLONE_CONFIG_GDRIVE_*` | Off-site backups (above) |
| `BACKUP_PASSWORD` | Only to open the older encrypted backups (until about January 2027) |

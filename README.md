# The Destiny Awards

> [!IMPORTANT]
> **Taking the site over? Read the [migration guide](docs/migration.md).**
>
> **What's needed:** a server with Docker, a domain with HTTPS (a Cloudflare tunnel is built in, or your own reverse proxy), a destiny.gg app for sign-in, a bucket for the clips, and the newest backup.
>
> **Clips:** the site keeps clips and thumbnails in any S3-compatible bucket.
> - **AWS S3 behind CloudFront** works: point the `R2_*` settings at the bucket, and `R2_PUBLIC_URL` at the CloudFront address. It hasn't been tested against AWS yet, and the daily copy of the clips to Drive needs a small change first (both in the guide).
> - **We suggest Cloudflare R2**, which the site runs on now. It doesn't charge for bandwidth, which matters on stream night when thousands of viewers play the clips, and this year's clips fit its free tier.
>
> **Export:**
> - the database: Settings → Backups → "Download a full backup" in `/admin`, or the newest file in the backups Drive folder
> - the clips: the Drive folder's `media/`, or a direct copy from the R2 bucket with rclone
>
> **Import:**
> 1. Put the database in the data volume as `sqlite.db` before the first start. Newer database updates apply on start.
> 2. Copy the clips to the root of your bucket as they are (`clips/…`, `thumbs/…`).
> 3. Fill in `.env`, then run `docker compose up -d --build app`.
>
> The backup shows who voted for what, so keep it private. Everyone signs in again on the new site.
>
> The development notes below are from the 2025 site. For running it today, see [AGENTS.md](AGENTS.md).

This project was made with [Bun](https://bun.com) via `bun init --react=tailwind`.
_[Install bun here](https://bun.com/get)._

As you may expect, the backend is handeled by Bun.
Relevant docs can be found here:

- https://bun.com/docs/bundler/fullstack
- https://bun.com/docs/runtime/http/server

The frontend uses [tailwind](https://tailwindcss.com) and [react](https://react.dev).

## Development

1. Clone the repository

   ```bash
   git clone https://git.defeten.com/defeten/dgga25.git
   cd dgga25
   ```

2. Install dependencies

   ```bash
   bun install
   ```

3. Configure Destiny.gg OAuth
   - Go to the [Destiny.gg Developer Page](https://www.destiny.gg/profile/developer) and create a new Dgg app with redirect URL `http://localhost:3000/oauth`

4. Set up environment variables
   - Create a new `.env` file

     ```bash
     cp .env.example .env
     ```

   - Generate an auth secret (used to verify auth sessions)

     ```bash
     # macOS/Linux
     openssl rand -base64 32
     ```

     ```powershell
     # Windows PowerShell
     [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
     ```

   - Update your `.env` file with your Dgg app credentials and auth secret

     ```bash
     vim .env
     ```

     ```bash
      DGG_CLIENT_ID=NQvNPuEX1MqOyx5KhR4XR8yO3DnRskAi # Sample
      DGG_CLIENT_SECRET=2RpAcAOPWWpB3\$9%qSIgen.%v%AuGv@hX>P-AfIQFbsYQz%h>z59Ms3qMNCSG3qN # Sample
      DGG_REDIRECT=http://localhost:3000/oauth
      DGG_ORIGIN=https://www.destiny.gg
      AUTH_SECRET=x6YaEmZju/7/Yzu5re80lHzACq0xnnx7MwIyvbtpsHs= # Sample
     ```

     > Note: All `$` in your secret must be escaped with a backslash.

5. Initialize the database and run migrations

   ```bash
   bunx --bun drizzle-kit generate
   bunx --bun drizzle-kit push
   ```

6. Start the development server

   ```bash
   bun dev
   ```

7. Use the `make-admin` script to make yourself an admin

   ```bash
   bun run ./scripts/make-admin.ts --db ./sqlite.db --username YourUsername
   ```

8. Import seed data
   - Generate a seed data JSON file using the `data-to-json` script

     ```bash
     bun run scripts/data-to-json.ts
     ```

   - Navigate to the [Dgg Awards admin dashboard](http://localhost:3000/admin)

   - Open the _Management_ tab
   - Copy the contents of the generated seed data JSON file (`scripts/data-to-json.out.json`) and paste into the _Import data_ sidebar input field
   - Click _Import_

### Contribution

This project is styled using [prettier](https://prettier.io/). The vscode extension can be found [here](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

Prettier will auto-sort imports+tailwind class order, and keep things consistent.

Do not use relative imports.

#### Final notes

- Drizzle uses Bun's native sqlite driver, but @libsql/client is still necessary for drizzle-kit, hence why it is a dev dependency.
- Importing static assets will include them in Bun's final production bundle. If you are getting typescript errors when importing files such as `import weow from '@/media/WEOW.png'` (later used like: `<img src={weow} />`), add a declaration to `[root]/bun-env.d.ts`.
  - Such as:
    ```ts
    declare module *.png {
      const content: string;
      export default content;
    }
    ```

## Usage

- Sign in via oauth (`/signin`)
- Run `bun run ./scripts/make-admin.ts --db ./sqlite.db --username <your username>` to make yourself an admin.
  - assumes default database filename
- Visit `/admin`
  - You should be redirected to the admin page
- From there you can control the site and view voting data.

#### Notes

If you plan on using the data import feature, make sure your data is JSON minified and conforms to the [ImportableData](https://git.defeten.com/defeten/dgga25/src/commit/32e48a63ea2c590f02a356d12d17676c8139d1cc/src/lib/types.ts#L36) type. You can use the `data-to-json` script by running `bun run scripts/data-to-json.ts`.

**Note: changes are aggressively applied in the `/admin` page.** If something is text-editable, it's likely your change will be applied immediately, even if the `/admin` page does not immediately reflect it.

## Building

This project can take advantage of Bun's bundler for production-ready builds.

From the project root directory, run `bun run build.ts`. This will create a folder called 'dist' in the project root which contains minified assets.

_Note that .env is copied over._

To use it:

```bash
cd dist
bun run index.js
# sign in, then kill the process
^C
bun run ../scripts/make-admin.ts --username [name] --db prod_sqlite.db # or whatever your db is called
# start the process again
bun run index.js
```

Bun can also create a single executable as a build. More docs can be found [here](https://bun.com/docs/bundler).

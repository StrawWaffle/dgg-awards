FROM oven/bun:1.4 AS app
WORKDIR /app

# ffmpeg cuts and converts clips; yt-dlp downloads them. yt-dlp is pinned and
# checksum-verified; bump both lines together to update it (sites change
# often, so expect to). It uses Bun as its JavaScript runtime for YouTube.
ARG YT_DLP_VERSION=2026.08.19
ARG YT_DLP_SHA256=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a
# rclone sends the off-site backups to Google Drive (src/server/backups.ts).
ARG RCLONE_VERSION=1.68.2
ARG RCLONE_SHA256=0e6fa18051e67fc600d803a2dcb10ddedb092247fc6eee61be97f64ec080a13c
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl unzip \
  && curl -fsSL --retry 6 --retry-all-errors --retry-delay 5 -o /usr/local/bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
  && echo "${YT_DLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
  && chmod +x /usr/local/bin/yt-dlp \
  && curl -fsSL --retry 6 --retry-all-errors --retry-delay 5 -o /tmp/rclone.zip \
    "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip" \
  && echo "${RCLONE_SHA256}  /tmp/rclone.zip" | sha256sum -c - \
  && unzip -j -q /tmp/rclone.zip "*/rclone" -d /usr/local/bin && rm /tmp/rclone.zip \
  && apt-get purge -y curl unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV NODE_ENV=production
ENV DB_FILE_NAME=/data/sqlite.db
# Clips and thumbnails, until R2 is configured (see src/server/storage.ts).
ENV MEDIA_DIR=/data/media
VOLUME /data
EXPOSE 3000

# Apply migrations, then serve. Bun bundles the HTML imports at startup.
CMD ["sh", "-c", "bun scripts/migrate.ts && bun src/index.tsx"]

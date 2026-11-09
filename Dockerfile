FROM oven/bun:1.4 AS app
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV NODE_ENV=production
ENV DB_FILE_NAME=/data/sqlite.db
VOLUME /data
EXPOSE 3000

# Apply migrations, then serve. Bun bundles the HTML imports at startup.
CMD ["sh", "-c", "bun scripts/migrate.ts && bun src/index.tsx"]

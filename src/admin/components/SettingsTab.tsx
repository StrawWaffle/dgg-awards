import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, inputClass } from "@/admin/components/editor/fields";
import type { ViewingMode } from "@/lib/types";
import type { VotingStyle } from "@/lib/voting";
import {
  type Config,
  backupNow,
  fetchBackupStatus,
  fetchConfig,
  importNominees,
  restoreBackup,
  saveSettings,
} from "@/lib/queries";

const modes: { value: ViewingMode; label: string; hint: string }[] = [
  { value: "locked", label: "Locked", hint: "Visitors see only the header." },
  { value: "voting", label: "Voting", hint: "Votes are accepted between the open and close times." },
  { value: "idle", label: "Idle", hint: "Nominees are shown, but nobody can vote and results stay hidden." },
  { value: "reviewing", label: "Results", hint: "The results are public." },
];

// <input type="datetime-local"> works in the browser's time zone, without one.
const toLocalInput = (seconds?: number) => {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : undefined);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function SettingsTab() {
  const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig });
  if (config.isPending) return <p className="text-sm">Loading…</p>;
  if (config.isError) return <ErrorText>Couldn't load the settings: {config.error.message}</ErrorText>;
  // Keyed on the loaded config, so the form starts over after a save.
  return (
    <div className="max-w-2xl space-y-6">
      <SettingsForm key={JSON.stringify(config.data)} config={config.data} />
      <DataSection />
      <BackupSection />
    </div>
  );
}

/** Export everything as a file to keep, and add categories from one. */
function DataSection() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      let summary = "";
      try {
        const data = JSON.parse(text) as { title: string; options: unknown[] }[];
        const nominees = data.reduce((n, c) => n + (c.options?.length ?? 0), 0);
        summary = `${data.length} categories with ${nominees} nominees`;
      } catch {
        throw new Error("That file isn't JSON.");
      }
      if (!confirm(`Add ${summary}? The database is backed up first, and this can be undone from History.`)) {
        return null;
      }
      await importNominees(text);
      return summary;
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    <section className="space-y-4 rounded border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-bold">Data</h2>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/export"
          download
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-100"
        >
          Download all nominees
        </a>
        <span className="text-sm text-neutral-600">
          Every category and nominee as a JSON file, hidden ones included. Not a full backup: see Backups.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) importing.mutate(file, { onSettled: () => fileInput.current && (fileInput.current.value = "") });
          }}
        />
        <Button onClick={() => fileInput.current?.click()} disabled={importing.isPending}>
          {importing.isPending ? "Importing…" : "Import from a file"}
        </Button>
        <span className="text-sm text-neutral-600">
          Adds the categories in a downloaded file. Categories that already exist are refused.
        </span>
      </div>
      {importing.data && <p className="text-sm text-neutral-600">Added {importing.data}.</p>}
      <ErrorText>{importing.error?.message}</ErrorText>
    </section>
  );
}

/** "3 minutes ago", for when the last backup ran. */
function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * Full backups: download one, see the off-site ones (hourly to Google Drive),
 * and restore from one. See docs/migration.md.
 */
function BackupSection() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["backup-status"], queryFn: fetchBackupStatus, refetchInterval: 60_000 });
  const now = useMutation({
    mutationFn: backupNow,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["backup-status"] }),
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const restore = useMutation({
    mutationFn: async () => {
      if (!file) return null;
      if (
        !confirm(
          `Replace everything in the database with ${file.name}? Awards, nominees, votes, users, settings and history are all replaced. The current database is saved on the server first.`,
        )
      ) {
        return null;
      }
      return restoreBackup(file, password);
    },
    onSuccess: (counts) => {
      if (!counts) return;
      setFile(null);
      setPassword("");
      queryClient.invalidateQueries();
    },
  });
  const db = status.data?.lastDatabase;
  const media = status.data?.lastMedia;

  return (
    <section className="space-y-4 rounded border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-bold">Backups</h2>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/backup"
          download
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-100"
        >
          Download a full backup
        </a>
        <span className="text-sm text-neutral-600">
          The whole database as one file: awards, nominees, votes, users, settings and history (not sign-ins). It holds
          voters' IP addresses, so keep it private.
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Off-site, to Google Drive</p>
        {status.data && !status.data.enabled && (
          <p className="text-neutral-600">Not set up on this server (see docs/migration.md).</p>
        )}
        {status.data?.enabled && (
          <>
            <p className="text-neutral-600">
              Every hour, encrypted, to <span className="font-mono">{status.data.remote}</span>. Kept: every copy for 2
              days, then one a day for 60 days. Clips and thumbnails are copied there once a day.
            </p>
            <p className={db && !db.ok ? "text-red-700" : "text-neutral-800"}>
              Database:{" "}
              {!db
                ? "not backed up yet (the first runs a few minutes after the server starts)."
                : db.ok
                  ? `last backed up ${ago(db.at)} (${db.file}, ${Math.max(1, Math.round((db.bytes ?? 0) / 1024))} kB).`
                  : `the last backup, ${ago(db.at)}, failed: ${db.error}`}
            </p>
            <p className={media && !media.ok ? "text-red-700" : "text-neutral-800"}>
              Clips and thumbnails:{" "}
              {!media ? "not copied yet." : media.ok ? `last copied ${ago(media.at)}.` : `the last copy, ${ago(media.at)}, failed: ${media.error}`}
            </p>
            <Button onClick={() => now.mutate()} disabled={now.isPending}>
              {now.isPending ? "Backing up…" : "Back up now"}
            </Button>
            <ErrorText>{now.error?.message}</ErrorText>
          </>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Restore from a backup</p>
        <p className="text-neutral-600">
          A downloaded .db file, or an encrypted .db.enc from Google Drive. Replaces the whole database; the current one
          is saved on the server first. The backup must be from this version of the site.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".db,.enc,.sqlite"
            className="hidden"
            onChange={(e) => {
              setFile(e.currentTarget.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={restore.isPending}>
            {file ? file.name : "Choose a backup file"}
          </Button>
          {file?.name.endsWith(".enc") && (
            <input
              type="password"
              className={`${inputClass} w-56`}
              placeholder="Its password, if not this site's"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              aria-label="Backup password"
            />
          )}
          <Button variant="danger" onClick={() => restore.mutate()} disabled={!file || restore.isPending}>
            {restore.isPending ? "Restoring…" : "Restore"}
          </Button>
        </div>
        {restore.data && (
          <p className="text-neutral-700">
            Restored:{" "}
            {Object.entries(restore.data)
              .filter(([, n]) => n > 0)
              .map(([t, n]) => `${n} ${t}`)
              .join(", ")}
            .
          </p>
        )}
        <ErrorText>{restore.error?.message}</ErrorText>
      </div>
    </section>
  );
}

function SettingsForm({ config }: { config: Config }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ViewingMode>(config.viewingMode ?? "locked");
  const [opens, setOpens] = useState(toLocalInput(config.startTime));
  const [closes, setCloses] = useState(toLocalInput(config.endTime));
  const [year, setYear] = useState(config.awardYear ?? "");
  const [style, setStyle] = useState<VotingStyle>(config.defaultVotingStyle ?? "single");

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        viewingMode: mode,
        startTime: fromLocalInput(opens),
        endTime: fromLocalInput(closes),
        ...(year ? { awardYear: Number(year) } : {}),
        defaultVotingStyle: style,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["config"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-nominees"] }),
        queryClient.invalidateQueries({ queryKey: ["checks"] }),
      ]),
  });

  const badWindow = opens && closes && opens >= closes;

  return (
    <form
      className="space-y-6 rounded border border-neutral-200 bg-white p-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <section className="space-y-4">
        <h2 className="text-sm font-bold">What visitors see</h2>
        <Field label="Mode" hint={modes.find((m) => m.value === mode)?.hint}>
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.currentTarget.value as ViewingMode)}>
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Voting opens" hint={`Your time zone: ${timeZone}`}>
            <input
              type="datetime-local"
              className={inputClass}
              value={opens}
              required
              onChange={(e) => setOpens(e.currentTarget.value)}
            />
          </Field>
          <Field label="Voting closes">
            <input
              type="datetime-local"
              className={inputClass}
              value={closes}
              required
              onChange={(e) => setCloses(e.currentTarget.value)}
            />
          </Field>
        </div>
        {badWindow && <ErrorText>Voting has to close after it opens.</ErrorText>}
      </section>

      <section className="space-y-4 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-bold">Awards</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Award year" hint="Nominee dates outside this year are flagged.">
            <input
              className={inputClass}
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.currentTarget.value)}
            />
          </Field>
          <Field
            label="Default voting style"
            hint="For categories without their own. Categories that already have votes keep theirs."
          >
            <select
              className={inputClass}
              value={style}
              onChange={(e) => setStyle(e.currentTarget.value as VotingStyle)}
            >
              <option value="single">Single pick</option>
              <option value="ranked">Ranked (instant runoff)</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-neutral-200 pt-6">
        <Button type="submit" variant="primary" disabled={save.isPending || !!badWindow}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {save.isSuccess && <span className="text-sm text-neutral-600">Saved.</span>}
        <ErrorText>{save.error?.message}</ErrorText>
      </div>
    </form>
  );
}

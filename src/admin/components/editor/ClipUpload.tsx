import { useEffect, useRef, useState } from "react";
import { Button, ErrorText, inputClass } from "@/admin/components/editor/fields";
import { libraryUrl, useLibrary } from "@/admin/components/editor/library";
import { formatTimestamp } from "@/lib/links";
import { clipFromLibrary } from "@/lib/queries";

/** Matches the server's limit (the tunnel refuses requests over 100 MB). */
const MAX_BYTES = 95 * 1024 * 1024;
const MAX_SECONDS = 180;
/** How much of the end "Check the ending" plays. */
const ENDING = 5;

/** Seconds to "m:ss.s", for marks that fall between whole seconds. */
const stamp = (s: number) => `${formatTimestamp(Math.floor(s))}${s % 1 >= 0.05 ? `.${Math.floor((s % 1) * 10)}` : ""}`;

/**
 * Make the clip from a video you already have: one from the library on the
 * server (the award's own folder first), or a file from your computer. Watch
 * it here (a computer file plays locally, nothing is sent yet), mark where
 * the clip starts and ends, check the cut, then make the clip. The server
 * cuts and converts it like a built clip. Without marks, the whole video is
 * used. Library files stay in the library.
 */
export function ClipUpload({
  categoryId,
  id,
  busy,
  onStarted,
}: {
  categoryId: string;
  id: string;
  /** A clip is already being built. */
  busy: boolean;
  onStarted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const { items: videos, folders } = useLibrary("video", categoryId);
  const [src, setSrc] = useState<string | null>(null);
  const [length, setLength] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  /** Where playback stops when previewing. */
  const stopAt = useRef<number | null>(null);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  const choose = (f: File | null) => {
    setError(null);
    setStart(null);
    setEnd(null);
    setLength(0);
    setLibraryPath(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(`That file is ${Math.round(f.size / 1024 / 1024)} MB; the limit is 95 MB. Trim it first, or export it smaller.`);
      return;
    }
    setFile(f);
    setSrc(URL.createObjectURL(f));
  };
  const pickLibrary = (path: string) => {
    setError(null);
    setStart(null);
    setEnd(null);
    setLength(0);
    setFile(null);
    setSrc(null);
    setLibraryPath(path || null);
  };
  const reset = () => {
    setFile(null);
    setLibraryPath(null);
    setSrc(null);
    setStart(null);
    setEnd(null);
    setError(null);
  };

  const now = () => Math.round((video.current?.currentTime ?? 0) * 10) / 10;
  const playPart = (from: number, to: number | null) => {
    const v = video.current;
    if (!v) return;
    stopAt.current = to;
    v.currentTime = from;
    void v.play();
  };
  const from = start ?? 0;
  const to = end ?? length;
  const part = to - from;
  const problem =
    end != null && end <= from
      ? "The end must come after the start."
      : part > MAX_SECONDS
        ? `Clips can be at most ${MAX_SECONDS} seconds; this part is ${Math.round(part)}. Mark a shorter part.`
        : null;

  const fromLibrary = async () => {
    if (!libraryPath) return;
    setError(null);
    setProgress(0);
    try {
      await clipFromLibrary(categoryId, id, libraryPath, start, end);
      reset();
      onStarted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };
  const upload = () => {
    if (libraryPath) return void fromLibrary();
    if (!file) return;
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("categoryId", categoryId);
    form.set("id", id);
    form.set("file", file);
    if (start != null) form.set("start", String(start));
    if (end != null) form.set("end", String(end));
    // XMLHttpRequest, not fetch, for the upload's progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/clip/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        reset();
        onStarted();
      } else {
        setError(xhr.status === 413 ? "That file is too big to upload." : xhr.responseText || `Upload failed (${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed: the connection dropped. Try again.");
    };
    xhr.send(form);
  };

  const shownSrc = libraryPath ? libraryUrl(libraryPath) : src;
  const chosen = !!file || !!libraryPath;

  return (
    <div className="space-y-3 rounded border border-neutral-200 p-3">
      <p className="text-sm font-medium">Or make it from a video you have</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {videos.length > 0 && (
          <select
            className={`${inputClass} w-auto max-w-md`}
            value={libraryPath ?? ""}
            disabled={progress !== null}
            onChange={(e) => pickLibrary(e.currentTarget.value)}
            aria-label="Video from the library"
          >
            <option value="">From the library…</option>
            {folders.map((g) => (
              <optgroup key={g.folder} label={`${g.folder || "Top level"}${g.mine ? " (this award)" : ""}`}>
                {g.items.map((v) => (
                  <option key={v.path} value={v.path}>
                    {v.name} ({Math.round(v.size / 1024 / 1024)} MB)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <span className="text-neutral-500">{videos.length > 0 ? "or from your computer:" : "From your computer:"}</span>
        <input
          type="file"
          accept="video/*,.mkv"
          className="text-sm"
          disabled={progress !== null}
          onChange={(e) => choose(e.currentTarget.files?.[0] ?? null)}
          aria-label="Video file"
        />
        {chosen && progress === null && <Button onClick={reset}>Cancel</Button>}
      </div>
      {!chosen && (
        <p className="text-xs text-neutral-500">
          A computer file can be MP4, MOV, MKV or WebM, up to 95 MB. You mark the part to keep before the clip is made.
        </p>
      )}

      {shownSrc && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <video
            key={shownSrc}
            ref={video}
            src={shownSrc}
            controls
            className="aspect-video w-full rounded bg-black"
            onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
            onTimeUpdate={(e) => {
              if (stopAt.current != null && e.currentTarget.currentTime >= stopAt.current) {
                e.currentTarget.pause();
                stopAt.current = null;
              }
            }}
          />
          <div className="space-y-3 text-sm">
            <p className="text-neutral-600">
              Play it, pause where the clip should start or end, and mark it.
              {length > 0 && ` The video is ${stamp(length)} long.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setStart(now())}>Start here</Button>
              <span className="w-20 tabular-nums">{start == null ? "beginning" : stamp(start)}</span>
              {start != null && <Button onClick={() => setStart(null)}>Clear</Button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setEnd(now())}>End here</Button>
              <span className="w-20 tabular-nums">{end == null ? "the end" : stamp(end)}</span>
              {end != null && <Button onClick={() => setEnd(null)}>Clear</Button>}
            </div>
            <p className="text-neutral-600">
              The clip: {stamp(from)} to {stamp(to)}, {stamp(Math.max(0, part))} long.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => playPart(from, to)}>Preview the clip</Button>
              <Button onClick={() => playPart(Math.max(from, to - ENDING), to)}>Check the ending</Button>
            </div>
            <ErrorText>{problem}</ErrorText>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={upload}
                disabled={!!problem || progress !== null || busy || length === 0}
                title={busy ? "Wait for the clip being built" : undefined}
              >
                {progress !== null
                  ? libraryPath
                    ? "Starting…"
                    : `Uploading… ${Math.round(progress * 100)}%`
                  : libraryPath
                    ? "Make the clip"
                    : "Upload and make the clip"}
              </Button>
              <span className="text-xs text-neutral-500">Replaces the current clip. The old one stays in the history.</span>
            </div>
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

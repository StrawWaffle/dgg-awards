import { useState } from "react";
import { Button } from "@/admin/components/editor/fields";
import { type LinkType, embedUrl, formatTimestamp, linkLabel, videoLinkTypes } from "@/lib/links";

/** How much of the end "Check the ending" plays. */
const ENDING = 5;

type Mode = "clip" | "ending";

/**
 * Plays the window picked with the clip start and end, from the source
 * itself, before anything is saved or built: the whole clip, or just its
 * last few seconds to check the cut. Uses the times as typed, unsaved.
 * - YouTube and direct video files stop at the end; a Twitch VOD only takes
 *   a start, so it keeps playing past the end.
 * - Kick, X and Reddit can't be embedded: build the clip and check that.
 */
export function ClipPreview({
  url,
  type,
  start,
  end,
}: {
  url: string;
  type: LinkType | null;
  start: number | null;
  end: number | null;
}) {
  const [playing, setPlaying] = useState<{ mode: Mode; from: number; to: number | null; n: number } | null>(null);
  // Only for links a clip can come from (not channels, profiles or pages).
  if (!url || !type || !videoLinkTypes.has(type)) return null;

  const from = start ?? 0;
  const windowFor = (mode: Mode) =>
    mode === "ending" && end != null ? { from: Math.max(from, end - ENDING), to: end } : { from, to: end };
  const sourceFor = (w: { from: number; to: number | null }) => {
    if (type === "video-file") return { kind: "video" as const, src: `${url}#t=${w.from}${w.to != null ? `,${w.to}` : ""}` };
    const src = embedUrl(url, { start: w.from, end: w.to, parent: location.hostname });
    return src ? { kind: "embed" as const, src } : null;
  };

  // Can this link be previewed at all? (A Twitch clip is already cut.)
  if (!sourceFor({ from, to: end })) {
    return (
      <p className="text-sm text-neutral-600">
        A {linkLabel(type)} can't be played here. Build the clip, then check it below.
      </p>
    );
  }
  const cutsItself = type === "twitch-clip" || type === "streamable";
  const stopsAtEnd = type === "youtube-video" || type === "video-file";
  // `n` restarts the player when the same window is played again.
  const play = (mode: Mode) => setPlaying((p) => ({ mode, ...windowFor(mode), n: (p?.n ?? 0) + 1 }));
  // Times edited while it's open: show what's playing, and offer to replay.
  const shown = playing && sourceFor(playing);
  const stale =
    playing !== null && (playing.from !== windowFor(playing.mode).from || playing.to !== windowFor(playing.mode).to);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button onClick={() => play("clip")}>{playing ? "Play the clip again" : "Preview the clip"}</Button>
        {!cutsItself && (
          <Button
            onClick={() => play("ending")}
            disabled={end == null}
            title={end == null ? "Set a clip end first" : `Plays the last ${ENDING} seconds`}
          >
            Check the ending
          </Button>
        )}
        {playing && <Button onClick={() => setPlaying(null)}>Close</Button>}
        <span className="text-neutral-600">
          {cutsItself
            ? `A ${linkLabel(type)} is already cut, so the start and end don't apply.`
            : stopsAtEnd
              ? "Uses the times as typed, before saving."
              : "Twitch can't stop at the end, so watch for the cut."}
        </span>
      </div>
      {shown && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-500">
            {cutsItself
              ? "The whole clip."
              : `${playing.mode === "ending" ? "The ending" : "The clip"}: ${formatTimestamp(playing.from)}${playing.to != null ? ` to ${formatTimestamp(playing.to)}` : " onwards"}.`}
            {stale && " The times have changed since: play it again to see them."}
          </p>
          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded bg-black">
            {shown.kind === "video" ? (
              <video key={`${shown.src}-${playing.n}`} className="h-full w-full" src={shown.src} controls autoPlay />
            ) : (
              <iframe
                key={`${shown.src}-${playing.n}`}
                src={shown.src}
                title="Clip preview"
                className="h-full w-full"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

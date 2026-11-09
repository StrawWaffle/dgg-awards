import { useEffect, useRef, useState } from "react";
import { EnterFullScreenIcon, PauseIcon, PlayIcon, SpeakerLoudIcon, SpeakerOffIcon } from "@radix-ui/react-icons";
import { type LinkType, classifyLink, linkAt, linkLabel } from "@/lib/links";
import { music } from "@/lab/music";
import { Sketch } from "@/lab/sketch";

export type Clip = {
  title: string;
  clipUrl: string;
  thumbnailUrl: string | null;
  url: string | null;
  linkType: LinkType | null;
  clipStart: number | null;
};

const clock = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** How long the controls stay after the pointer stops, while playing. */
const CONTROLS_MS = 2000;

/**
 * A nominee's clip in a hand-drawn frame: plays once and stops on its last
 * frame (no loop, as the 2025 stream wanted), with the full source linked at
 * the moment it starts. The music fades out while it plays.
 *
 * Its controls are our own, in the lab's look: play, a seek bar, the time,
 * sound and full screen. They show while paused or when the pointer moves.
 * `fill` makes it fill its box's height (the big screen) instead of its width.
 */
export function ClipPlayer({
  clip,
  autoPlay = true,
  fill = false,
  onEnded,
}: {
  clip: Clip;
  autoPlay?: boolean;
  fill?: boolean;
  onEnded?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(!autoPlay);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [awake, setAwake] = useState(true);
  const sleep = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      music.setDucked(false);
      clearTimeout(sleep.current);
    },
    [],
  );
  const wake = () => {
    setAwake(true);
    clearTimeout(sleep.current);
    sleep.current = setTimeout(() => setAwake(false), CONTROLS_MS);
  };
  const type = clip.linkType ?? (clip.url ? classifyLink(clip.url)?.type : null) ?? null;
  const v = () => video.current!;
  const toggle = () => (v().paused || v().ended ? v().play().catch(() => {}) : v().pause());
  const showControls = paused || awake;
  const done = duration ? (time / duration) * 100 : 0;

  return (
    <div className={fill ? "flex h-full flex-col gap-2" : "space-y-2"}>
      <Sketch pad={5} radius={18} strokeWidth={3} boil drawOn className={fill ? "min-h-0 flex-1" : ""}>
        <div ref={frame} className={`group relative overflow-hidden rounded-[16px] bg-black ${fill ? "h-full" : ""}`} onPointerMove={wake}>
          <video
            ref={video}
            className={`block w-full ${fill ? "h-full object-contain" : "aspect-video"}`}
            src={clip.clipUrl}
            poster={clip.thumbnailUrl ?? undefined}
            autoPlay={autoPlay}
            playsInline
            onClick={toggle}
            onPlay={() => {
              setPaused(false);
              wake();
              music.setDucked(true);
            }}
            onPause={() => {
              setPaused(true);
              music.setDucked(false);
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onEnded={() => {
              setPaused(true);
              music.setDucked(false);
              onEnded?.();
            }}
          />
          <div
            className={`lab-video-bar absolute inset-x-3 bottom-3 flex items-center gap-3 px-2 py-1.5 ${showControls ? "" : "pointer-events-none opacity-0"}`}
          >
            <button
              type="button"
              className="cozy-btn round primary h-8 w-8"
              onClick={toggle}
              aria-label={paused ? "Play" : "Pause"}
              title={paused ? "Play" : "Pause"}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <input
              type="range"
              className="lab-seek min-w-0 flex-1"
              min={0}
              max={duration || 1}
              step={0.05}
              value={time}
              onChange={(e) => {
                const t = Number(e.currentTarget.value);
                v().currentTime = t;
                setTime(t);
              }}
              style={{ "--done": `${done}%` } as React.CSSProperties}
              aria-label="Seek"
            />
            <span className="hand shrink-0 text-lg font-bold tabular-nums">
              {clock(time)} / {clock(duration)}
            </span>
            <button
              type="button"
              className="cozy-btn round h-8 w-8"
              onClick={() => (v().muted = !v().muted)}
              aria-label={muted ? "Sound on" : "Sound off"}
              title={muted ? "Sound on" : "Sound off"}
            >
              {muted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}
            </button>
            <button
              type="button"
              className="cozy-btn round h-8 w-8"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen())}
              aria-label="Full screen"
              title="Full screen"
            >
              <EnterFullScreenIcon />
            </button>
          </div>
        </div>
      </Sketch>
      <div className={`flex flex-wrap items-center justify-between gap-2 text-sm font-bold ${fill ? "cozy-panel px-4 py-1.5" : "px-1"}`}>
        <span>{clip.title}</span>
        {clip.url && type && (
          <a className="underline" href={linkAt(clip.url, clip.clipStart ?? 0)} target="_blank" rel="noopener noreferrer">
            ↗ Full context: {linkLabel(type, clip.clipStart ?? undefined)}
          </a>
        )}
      </div>
    </div>
  );
}

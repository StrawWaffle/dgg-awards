import { SpeakerLoudIcon, SpeakerOffIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { Emote } from "@/lab/Emote";
import { music, useMusic } from "@/lab/music";

/**
 * The music in the header: one emote button, Listening while the music plays
 * and MMMM when it's muted (hovering shows the usual speaker icon), and the
 * volume beside it. Remembered per browser; the music starts on the first
 * click unless it was muted last time.
 *
 * While the volume is being changed, the button shows how loud it is: MMMM
 * under 10%, OOOO swimming at 0–200% speed with the volume, and OverRustle at
 * full. The emotes slide in and out as they change.
 */
const QUIET = 0.1;
const FULL = 0.995;
/** How long the volume emote stays after the last change. */
const LINGER_MS = 1200;
export type MusicState = { playing: boolean; muted: boolean; volume: number };

/** The music button's action: start it (unmuted) if it isn't playing, else mute or unmute. */
export function toggleMusic() {
  const state = music.getSnapshot();
  if (!state.playing) {
    music.setMuted(false);
    music.play();
  } else music.setMuted(!state.muted);
}

/**
 * `small` for the big screen's control box. The pop-out window passes the big
 * screen's `state` and sends the changes over (`onToggle`, `onVolume`); the
 * music itself only plays in the big screen's window.
 */
export function MusicBar({
  small = false,
  state: shown,
  onToggle = toggleMusic,
  onVolume = (v: number) => music.setVolume(v),
}: {
  small?: boolean;
  state?: MusicState;
  onToggle?: () => void;
  onVolume?: (v: number) => void;
} = {}) {
  const local = useMusic();
  const state = shown ?? local;
  const audible = state.playing && !state.muted;
  const toggle = onToggle;
  const label = audible ? "Mute the music" : "Play the music";
  const level = state.muted ? 0 : state.volume;

  // Showing the volume: while the slider is held, and a moment after a change.
  const [held, setHeld] = useState(false);
  const [recent, setRecent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const changed = () => {
    setRecent(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRecent(false), LINGER_MS);
  };
  const adjusting = held || recent;
  const emote = adjusting
    ? level < QUIET
      ? "MMMM"
      : level >= FULL
        ? "OverRustle"
        : "OOOO"
    : audible
      ? "Listening"
      : "MMMM";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggle} className={`cozy-btn round group relative ${small ? "h-8 w-8" : "h-10 w-10"}`} aria-label={label} title={label}>
        <span className="absolute inset-0 overflow-hidden rounded-full transition-opacity group-hover:opacity-0">
          <SwapEmote name={emote} rate={emote === "OOOO" ? level * 2 : 1} />
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          {audible ? <SpeakerOffIcon width={18} height={18} /> : <SpeakerLoudIcon width={18} height={18} />}
        </span>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        onChange={(e) => {
          onVolume(Number(e.currentTarget.value));
          changed();
        }}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => {
          setHeld(false);
          changed();
        }}
        onPointerCancel={() => setHeld(false)}
        className={`cozy-range ${small ? "w-16" : "w-24"}`}
        aria-label="Volume"
        title={`Volume ${Math.round(level * 100)}%`}
      />
    </div>
  );
}

/** An emote that slides up and out when it changes, as the next slides in. */
function SwapEmote({ name, rate }: { name: string; rate: number }) {
  const [gone, setGone] = useState<{ name: string; key: number }[]>([]);
  const last = useRef(name);
  const keys = useRef(0);
  useEffect(() => {
    if (last.current === name) return;
    const old = { name: last.current, key: keys.current++ };
    last.current = name;
    setGone((g) => [...g, old]);
    setTimeout(() => setGone((g) => g.filter((x) => x !== old)), 280);
  }, [name]);
  // Slide in on a change (from this render, before the effect has run).
  const sliding = last.current !== name || gone.length > 0;
  const place = "absolute inset-0 flex items-center justify-center";
  return (
    <>
      {gone.map((g) => (
        <span key={`gone-${g.key}`} className={`${place} lab-swap-out`}>
          <Emote name={g.name} size={0.75} title="" />
        </span>
      ))}
      <span key={name} className={`${place} ${sliding ? "lab-swap-in" : ""}`}>
        <Emote name={name} size={0.75} title="" rate={rate} />
      </span>
    </>
  );
}

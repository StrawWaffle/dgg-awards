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
 * under 10%, otherwise OOOO, animating at 0–150% speed with the volume.
 */
const QUIET = 0.1;
/** How long the volume emote stays after the last change. */
const LINGER_MS = 1200;
export function MusicBar() {
  const state = useMusic();
  const audible = state.playing && !state.muted;
  const toggle = () => {
    if (!state.playing) {
      music.setMuted(false);
      music.play();
    } else music.setMuted(!state.muted);
  };
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
  const emote = adjusting ? (level < QUIET ? "MMMM" : "OOOO") : audible ? "Listening" : "MMMM";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggle} className="cozy-btn round group relative h-10 w-10" aria-label={label} title={label}>
        <span className="transition-opacity group-hover:opacity-0">
          <Emote name={emote} size={0.75} title="" rate={emote === "OOOO" ? level * 1.5 : 1} />
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
          music.setVolume(Number(e.currentTarget.value));
          changed();
        }}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => {
          setHeld(false);
          changed();
        }}
        onPointerCancel={() => setHeld(false)}
        className="cozy-range w-24"
        aria-label="Volume"
        title={`Volume ${Math.round(level * 100)}%`}
      />
    </div>
  );
}

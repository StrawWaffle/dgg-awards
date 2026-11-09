import { SpeakerLoudIcon, SpeakerOffIcon } from "@radix-ui/react-icons";
import { Emote } from "@/lab/Emote";
import { music, useMusic } from "@/lab/music";

/**
 * The music in the header: one emote button, Listening while the music plays
 * and MMMM when it's muted (hovering shows the usual speaker icon), and the
 * volume beside it. Remembered per browser; the music starts on the first
 * click unless it was muted last time.
 */
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
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggle} className="cozy-btn round group relative h-10 w-10" aria-label={label} title={label}>
        <span className="transition-opacity group-hover:opacity-0">
          <Emote name={audible ? "Listening" : "MMMM"} size={0.75} title="" />
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
        value={state.muted ? 0 : state.volume}
        onChange={(e) => music.setVolume(Number(e.currentTarget.value))}
        className="cozy-range w-24"
        aria-label="Volume"
        title={`Volume ${Math.round((state.muted ? 0 : state.volume) * 100)}%`}
      />
    </div>
  );
}

import { Emote } from "@/lab/Emote";
import { music, useMusic } from "@/lab/music";

/**
 * Play or pause, volume and mute. Remembered per browser; the music starts on
 * the first click unless it was switched off. The track credit goes with it.
 */
export function MusicBar() {
  const state = useMusic();
  const audible = state.playing && !state.muted && state.volume > 0;
  return (
    <div className="bg-black-1/80 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm">
      <button
        type="button"
        onClick={() => (state.playing ? music.pause() : music.play())}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
        aria-label={state.playing ? "Pause the music" : "Play the music"}
      >
        {/* Listening while it plays, as dgg-radio does for music. */}
        <span className={state.playing ? "" : "opacity-50 grayscale"}>
          <Emote name="Listening" size={0.8} title="" />
        </span>
        {state.playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={() => music.setMuted(!state.muted)}
        className="rounded px-2 py-1 hover:bg-white/10"
        aria-pressed={state.muted}
      >
        {state.muted ? "Unmute" : "Mute"}
      </button>
      <label className="flex items-center gap-2">
        <span className="sr-only">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.muted ? 0 : state.volume}
          onChange={(e) => music.setVolume(Number(e.currentTarget.value))}
          className="accent-orange-1 w-28"
          aria-label="Volume"
        />
        <span className="w-9 text-right tabular-nums">{audible ? Math.round(state.volume * 100) : 0}%</span>
      </label>
      <a
        className="text-white-1/60 hover:text-white-1 text-xs underline"
        href="https://soundcloud.com/tinyghoststudios/black-lover-instrumental-only"
        target="_blank"
        rel="noopener noreferrer"
      >
        Music: black lover (instrumental) by Tiny Ghost Studios
      </a>
    </div>
  );
}

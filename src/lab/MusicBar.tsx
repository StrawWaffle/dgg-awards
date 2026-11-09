import { Emote } from "@/lab/Emote";
import { music, useMusic } from "@/lab/music";

/**
 * Play or pause, mute and volume, for the header. Remembered per browser;
 * the music starts on the first click unless it was switched off.
 */
export function MusicBar() {
  const state = useMusic();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (state.playing ? music.pause() : music.play())}
        className="cozy-btn round h-10 w-10"
        aria-label={state.playing ? "Pause the music" : "Play the music"}
        title={state.playing ? "Pause the music" : "Play the music"}
      >
        {/* Listening while it plays, as dgg-radio does for music. */}
        <span className={state.playing ? "" : "opacity-40 grayscale"}>
          <Emote name="Listening" size={0.75} title="" />
        </span>
      </button>
      <button
        type="button"
        onClick={() => music.setMuted(!state.muted)}
        className="cozy-btn px-3! py-1.5! text-sm"
        aria-pressed={state.muted}
      >
        {state.muted ? "Unmute" : "Mute"}
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

import { useCallback, useRef } from "react";
import { Emote } from "@/lab/Emote";
import { type Levels, type Source, music, useFrame } from "@/lab/music";

const DANCERS = ["catJAM", "AlienPls", "pepeJAM", "RainbowPls", "GatoPls", "RaveDoge", "YAM", "Listening"];

/**
 * The sound check: the two readings of the music side by side (precomputed
 * beat map and live analyser), and dancing emotes moving to whichever is
 * chosen. Updates the DOM directly each frame rather than through React state.
 */
export function Visualizer({ source, setSource }: { source: Source; setSource: (s: Source) => void }) {
  const meters = useRef<Record<string, HTMLDivElement | null>>({});
  const dots = useRef<Record<Source, HTMLDivElement | null>>({ live: null, map: null });
  const dancers = useRef<(HTMLDivElement | null)[]>([]);
  const hop = useRef(0);
  const readout = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const onFrame = useCallback((levels: Record<Source, Levels>, dt: number) => {
    for (const s of ["live", "map"] as const) {
      for (const band of ["bass", "mid", "high"] as const) {
        const el = meters.current[`${s}-${band}`];
        if (el) el.style.width = `${Math.round(levels[s][band] * 100)}%`;
      }
      const dot = dots.current[s];
      if (dot && levels[s].beat) dot.animate([{ opacity: 1, scale: 1.6 }, { opacity: 0.2, scale: 1 }], { duration: 300 });
    }
    const l = levels[sourceRef.current];
    // A big hop on the one of each bar, a little bob on the other beats.
    if (l.downbeat) hop.current = 1;
    else if (l.beat) hop.current = Math.max(hop.current, 0.3);
    hop.current = Math.max(0, hop.current - dt * 5);
    dancers.current.forEach((el, i) => {
      if (!el) return;
      // Alternate dancers hop on the beat; all of them swell with the bass.
      el.style.translate = `0 ${-(i % 2 === 0 ? hop.current : hop.current * 0.5) * 18}px`;
      el.style.scale = String(1 + l.bass * 0.35);
    });
    if (readout.current) readout.current.textContent = `${l.time.toFixed(1)} s`;
  }, []);
  useFrame(onFrame);

  return (
    <div className="space-y-5">
      <div className="cozy-panel space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cozy-chip coral">Sound check</span>
          <span className="cozy-chip green">{music.map.bpm} bpm</span>
          <span ref={readout} className="cozy-chip tabular-nums" />
        </div>
        <h2 className="text-3xl font-black">What the page dances to</h2>
        <p className="font-semibold" style={{ color: "var(--muted)" }}>
          The music starts on your first click. Pick which reading drives the animation: the beat map worked out ahead
          of time, or the live analyser listening as it plays.
        </p>
        <div className="flex flex-wrap gap-3">
          {(["map", "live"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} className={`cozy-btn ${source === s ? "primary" : ""}`} aria-pressed={source === s}>
              {s === "map" ? "Beat map" : "Live analyser"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {(["map", "live"] as const).map((s) => (
          <div key={s} className="cozy-panel space-y-2 p-5">
            <div className="flex items-center gap-2 font-black">
              {s === "map" ? "Beat map" : "Live analyser"}
              <div ref={(el) => void (dots.current[s] = el)} className="h-3 w-3 rounded-full opacity-20" style={{ background: "var(--coral)" }} />
            </div>
            {(["bass", "mid", "high"] as const).map((band) => (
              <div key={band} className="flex items-center gap-3 text-sm font-bold">
                <span className="w-10">{band}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--cream)", border: "2px solid var(--panel-border)" }}>
                  <div ref={(el) => void (meters.current[`${s}-${band}`] = el)} className="h-full rounded-full" style={{ width: 0, background: "var(--primary)" }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="cozy-panel flex flex-wrap items-end justify-center gap-8 px-6 py-10">
        {DANCERS.map((name, i) => (
          <div key={name} ref={(el) => void (dancers.current[i] = el)} style={{ transformOrigin: "bottom" }}>
            <Emote name={name} size={1.5} />
          </div>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useRef } from "react";
import { Emote } from "@/lab/Emote";
import { type Levels, type Source, music, useFrame } from "@/lab/music";

const DANCERS = ["catJAM", "AlienPls", "pepeJAM", "RainbowPls", "GatoPls", "RaveDoge", "YAM", "Listening"];

/**
 * The two readings of the music next to each other (live analyser and the
 * precomputed map), and a row of dancing emotes moving to whichever is chosen.
 * Updates the DOM directly each frame rather than through React state.
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
      if (dot && levels[s].beat) {
        dot.animate([{ opacity: 1, scale: 1.6 }, { opacity: 0.15, scale: 1 }], { duration: 300 });
      }
    }
    const l = levels[sourceRef.current];
    if (l.beat) hop.current = 1;
    hop.current = Math.max(0, hop.current - dt * 5);
    dancers.current.forEach((el, i) => {
      if (!el) return;
      // Alternate dancers hop on the beat; all of them swell with the bass.
      const up = i % 2 === 0 ? hop.current : hop.current * 0.5;
      el.style.translate = `0 ${-up * 18}px`;
      el.style.scale = String(1 + l.bass * 0.35);
    });
    if (readout.current) readout.current.textContent = `${l.time.toFixed(1)} s`;
  }, []);
  useFrame(onFrame);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Animate from:</span>
        {(["map", "live"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`rounded border px-2 py-1 ${source === s ? "border-orange-1 text-orange-1" : "border-white/20"}`}
          >
            {s === "map" ? `Beat map (${music.map.bpm} bpm, precomputed)` : "Live analyser"}
          </button>
        ))}
        <span ref={readout} className="text-white-1/60 tabular-nums" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["map", "live"] as const).map((s) => (
          <div key={s} className="space-y-1 rounded-md bg-black/20 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold">{s === "map" ? "Beat map" : "Live analyser"}</span>
              <div ref={(el) => void (dots.current[s] = el)} className="bg-orange-1 h-2.5 w-2.5 rounded-full opacity-15" />
            </div>
            {(["bass", "mid", "high"] as const).map((band) => (
              <div key={band} className="flex items-center gap-2">
                <span className="w-8">{band}</span>
                <div className="h-2 flex-1 rounded bg-white/10">
                  <div
                    ref={(el) => void (meters.current[`${s}-${band}`] = el)}
                    className="bg-blue-1 h-full rounded"
                    style={{ width: 0 }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-center gap-6 py-4">
        {DANCERS.map((name, i) => (
          <div key={name} ref={(el) => void (dancers.current[i] = el)} style={{ transformOrigin: "bottom" }}>
            <Emote name={name} size={1.4} />
          </div>
        ))}
      </div>
    </div>
  );
}

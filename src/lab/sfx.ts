// Little sound effects, made with Web Audio (no files to load), at the music's
// volume and muted with it. A first click or key press is needed before any
// browser plays sound; every effect here follows one.
import { gainOf, music } from "@/lab/music";

let ctx: AudioContext | null = null;

/** One soft note: a quick attack, then a fade. `slide` bends it to another pitch. */
function note(freq: number, at: number, length: number, type: OscillatorType, loud: number, slide?: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  const t = c.currentTime + at;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(loud, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function play(fn: (v: number) => void) {
  const { volume, muted } = music.getSnapshot();
  if (muted || volume <= 0) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    // Effects sit a little under the music.
    fn(Math.max(0.02, gainOf(volume) * 0.6));
  } catch {}
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, B5 = 987.77, C6 = 1046.5, A3 = 220, E3 = 164.81;

export const sfx = {
  /** Yes: two rising notes. */
  yes: () => play((v) => (note(E5, 0, 0.12, "triangle", v), note(B5, 0.07, 0.18, "triangle", v))),
  /** No: a soft low drop. */
  no: () => play((v) => note(A3, 0, 0.16, "sine", v * 1.4, E3)),
  /** Maybe: one middling tick. */
  maybe: () => play((v) => note(G5, 0, 0.09, "square", v * 0.35)),
  /** A side picked: a pop. */
  pick: () => play((v) => note(C6, 0, 0.08, "triangle", v, C5)),
  /** Equal: the same note twice. */
  tie: () => play((v) => (note(E5, 0, 0.08, "triangle", v), note(E5, 0.09, 0.1, "triangle", v))),
  /** Stepping back: a quick fall. */
  back: () => play((v) => note(G5, 0, 0.1, "sine", v * 0.8, C5)),
  /** The top ten is done: a little arpeggio. */
  done: () => play((v) => [C5, E5, G5, C6].forEach((f, i) => note(f, i * 0.09, 0.3, "triangle", v))),
};

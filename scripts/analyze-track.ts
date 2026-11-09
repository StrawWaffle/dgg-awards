// Analyse a music track once, ahead of time, into a beat and energy map the
// lab page animates from (src/lab/music.ts). Needs ffmpeg, so run it in the
// app image:
//   bun scripts/analyze-track.ts src/lab/assets/black-lover.m4a src/lab/assets/black-lover.beats.json
//
// What it finds, per hop of HOP samples (~23 ms):
// - energy in three bands (bass < 150 Hz, mids < 2 kHz, highs above), from an FFT
// - onsets: peaks in the spectral flux (how much louder each band got)
// - the tempo, from the autocorrelation of that onset curve, and a beat grid
//   lined up with the onsets
import { spawn } from "bun";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: bun scripts/analyze-track.ts <audio> <out.json>");
  process.exit(1);
}

const RATE = 22050;
const FRAME = 1024;
const HOP = 512;
/** The map stores the curves at this step, to keep the file small. */
const STEP_S = 0.05;

// Decode to mono 32-bit float PCM.
const ffmpeg = spawn(["ffmpeg", "-v", "error", "-i", input, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], {
  stdout: "pipe",
});
const pcm = new Float32Array(await new Response(ffmpeg.stdout).arrayBuffer());
if ((await ffmpeg.exited) !== 0) throw new Error("ffmpeg failed");
const duration = pcm.length / RATE;

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const cos = Math.cos(angle * k);
        const sin = Math.sin(angle * k);
        const a = i + k;
        const b = a + len / 2;
        const tre = re[b]! * cos - im[b]! * sin;
        const tim = re[b]! * sin + im[b]! * cos;
        re[b] = re[a]! - tre;
        im[b] = im[a]! - tim;
        re[a]! += tre;
        im[a]! += tim;
      }
    }
  }
}

const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
const binHz = RATE / FRAME;
const bands = [
  [1, Math.round(150 / binHz)],
  [Math.round(150 / binHz), Math.round(2000 / binHz)],
  [Math.round(2000 / binHz), FRAME / 2],
] as const;

const frames = Math.floor((pcm.length - FRAME) / HOP);
const energy = bands.map(() => new Float64Array(frames));
const flux = new Float64Array(frames);
let previous = new Float64Array(FRAME / 2);
const re = new Float64Array(FRAME);
const im = new Float64Array(FRAME);

for (let f = 0; f < frames; f++) {
  for (let i = 0; i < FRAME; i++) {
    re[i] = pcm[f * HOP + i]! * window[i]!;
    im[i] = 0;
  }
  fft(re, im);
  const mag = new Float64Array(FRAME / 2);
  for (let k = 0; k < FRAME / 2; k++) mag[k] = Math.log1p(Math.hypot(re[k]!, im[k]!));
  bands.forEach(([lo, hi], b) => {
    let sum = 0;
    for (let k = lo; k < hi; k++) sum += mag[k]!;
    energy[b]![f] = sum / (hi - lo);
  });
  // Spectral flux, weighted towards the low end where the beat lives.
  let rise = 0;
  for (let k = 1; k < FRAME / 2; k++) {
    const d = mag[k]! - previous[k]!;
    if (d > 0) rise += k < bands[0][1] * 2 ? d * 2 : d;
  }
  flux[f] = rise;
  previous = mag;
}

const hopS = HOP / RATE;

// Onsets: flux peaks above a moving median of their surroundings.
const onsets: number[] = [];
const span = Math.round(0.25 / hopS);
for (let f = 1; f < frames - 1; f++) {
  if (flux[f]! < flux[f - 1]! || flux[f]! < flux[f + 1]!) continue;
  const around = Array.from(flux.subarray(Math.max(0, f - span), Math.min(frames, f + span))).sort((a, b) => a - b);
  const median = around[Math.floor(around.length / 2)]!;
  if (flux[f]! > median * 1.5 + 1 && (onsets.length === 0 || f * hopS - onsets.at(-1)! > 0.1)) onsets.push(f * hopS);
}

// Tempo: the lag (70 to 180 bpm) where the flux curve best matches itself.
// The slow swell of the music is taken out first (flux minus its moving
// average over a second), or the longest lag always wins.
const trendSpan = Math.round(0.5 / hopS);
const detrended = new Float64Array(frames);
for (let f = 0; f < frames; f++) {
  let sum = 0;
  let n = 0;
  for (let g = Math.max(0, f - trendSpan); g < Math.min(frames, f + trendSpan); g++, n++) sum += flux[g]!;
  detrended[f] = Math.max(0, flux[f]! - sum / n);
}
let bestLag = 0;
let bestScore = -Infinity;
const scores: [number, number][] = [];
for (let lag = Math.round(60 / 180 / hopS); lag <= Math.round(60 / 70 / hopS); lag++) {
  let score = 0;
  for (let f = 0; f + lag < frames; f++) score += detrended[f]! * detrended[f + lag]!;
  // A slight pull towards 120 bpm, so half and double tempos don't win on noise.
  score *= 1 - 0.15 * Math.abs(Math.log2((60 / (lag * hopS)) / 120));
  scores.push([60 / (lag * hopS), score]);
  if (score > bestScore) {
    bestScore = score;
    bestLag = lag;
  }
}
/** For a beat period: the phase landing most onsets on a beat, and how many. */
function bestGrid(period: number) {
  let phase = 0;
  let hits = -1;
  for (let p = 0; p < period; p += hopS) {
    let h = 0;
    for (const t of onsets) {
      const off = Math.abs((((t - p) % period) + period * 1.5) % period - period / 2);
      if (off < 0.05) h++;
    }
    if (h > hits) {
      hits = h;
      phase = p;
    }
  }
  return { phase, hits };
}

// Tempos a third or a half apart (a triplet feel) score alike above, so the
// strongest few are put to the grid: the one whose beats and onsets agree
// best both ways (F1 of beats on an onset and onsets on a beat) wins.
const candidates = [...scores]
  .sort((a, b) => b[1] - a[1])
  .filter(([, s]) => s > bestScore * 0.6)
  .slice(0, 4)
  .map(([candidateBpm]) => {
    const period = 60 / candidateBpm;
    const { phase, hits } = bestGrid(period);
    const beatCount = Math.floor((duration - phase) / period) + 1;
    const precision = hits / beatCount;
    const recall = hits / onsets.length;
    return { bpm: candidateBpm, period, phase, hits, f1: (2 * precision * recall) / (precision + recall) };
  })
  .sort((a, b) => b.f1 - a.f1);
console.log("grid fit:", candidates.map((c) => `${c.bpm.toFixed(1)} bpm F1 ${c.f1.toFixed(2)}`).join(", "));
// One hop is a coarse step at these lags (117.5 and 123 bpm are neighbours),
// so search finely around the winner for the period that lands most onsets.
let chosen = candidates[0]!;
for (let p = chosen.period * 0.96; p <= chosen.period * 1.04; p += 0.001) {
  const grid = bestGrid(p);
  if (grid.hits > chosen.hits) chosen = { ...chosen, bpm: 60 / p, period: p, ...grid };
}
const period = chosen.period;
const bpm = chosen.bpm;
const bestPhase = chosen.phase;
const bestHits = chosen.hits;
void bestLag;
const beats: number[] = [];
for (let t = bestPhase; t < duration; t += period) beats.push(Number(t.toFixed(3)));

// Curves, resampled to STEP_S and scaled 0–100 against each band's loud end.
function curve(values: Float64Array) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)]!;
  const hi = sorted[Math.floor(sorted.length * 0.98)]!;
  const out: number[] = [];
  for (let t = 0; t < duration; t += STEP_S) {
    const f = Math.min(frames - 1, Math.round(t / hopS));
    out.push(Math.round(Math.max(0, Math.min(1, (values[f]! - lo) / (hi - lo))) * 100));
  }
  return out;
}

// Bars, assuming 4/4: which beat is the "one". The kick usually lands hardest
// there, so of the four ways to group the beats, take the one whose first
// beats carry the most bass.
const bassAt = (t: number) => energy[0]![Math.min(frames - 1, Math.round(t / hopS))]!;
const barScores = [0, 1, 2, 3].map((offset) =>
  beats.reduce((sum, t, i) => (i % 4 === offset ? sum + bassAt(t) : sum), 0),
);
const downbeat = barScores.indexOf(Math.max(...barScores));
console.log("bass on each beat of the bar:", barScores.map((x) => x.toFixed(0)).join(", "), "→ the one is beat", downbeat);

const map = {
  track: input.split("/").pop(),
  duration: Number(duration.toFixed(3)),
  bpm: Number(bpm.toFixed(2)),
  /** Index into `beats` of the first downbeat; every 4th beat from it starts a bar. */
  downbeat,
  step: STEP_S,
  beats,
  onsets: onsets.map((t) => Number(t.toFixed(3))),
  bass: curve(energy[0]!),
  mid: curve(energy[1]!),
  high: curve(energy[2]!),
};
await Bun.write(output, JSON.stringify(map));
console.log(
  `${map.track}: ${duration.toFixed(1)} s, ${bpm.toFixed(1)} bpm, ${beats.length} beats, ${onsets.length} onsets, ${bestHits} onsets on the grid`,
);
const top = [...scores].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log("strongest tempos:", top.map(([b, s]) => `${b.toFixed(1)} (${(s / top[0]![1]).toFixed(2)})`).join(", "));

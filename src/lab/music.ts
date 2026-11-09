// The background music: one looping track, its volume and mute remembered per
// browser, and two ways to read it for animation, side by side:
// - live: a Web Audio analyser on what's playing now
// - map: a beat and energy map worked out ahead of time
//   (scripts/analyze-track.ts), looked up by playback position
// Visuals read the music before the volume, so they keep moving when muted.
import { useEffect, useState, useSyncExternalStore } from "react";
import beatMap from "@/lab/assets/black-lover.beats.json";

export type Levels = {
  /** 0–1 */
  bass: number;
  mid: number;
  high: number;
  /** True on the frame a beat lands. */
  beat: boolean;
  /** Seconds into the track. */
  time: number;
};
export type Source = "live" | "map";

const SILENT: Levels = { bass: 0, mid: 0, high: 0, beat: false, time: 0 };
const PREFS_KEY = "lab.music";
const DEFAULT_VOLUME = 0.25;

type Prefs = { volume: number; muted: boolean; off: boolean };
function loadPrefs(): Prefs {
  try {
    return { volume: DEFAULT_VOLUME, muted: false, off: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { volume: DEFAULT_VOLUME, muted: false, off: false };
  }
}

class Music {
  readonly audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  prefs = loadPrefs();
  playing = false;
  private listeners = new Set<() => void>();
  // Live beat detection: bass well above its recent average, at most every 250 ms.
  private bassHistory: number[] = [];
  private lastLiveBeat = 0;
  private lastMapTime = 0;
  readonly map = beatMap;

  constructor() {
    // AAC where the browser has it (most do); MP3 for the rest, such as
    // Chromium builds without proprietary codecs.
    const aac = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"') !== "";
    this.audio = new Audio(aac ? "/lab/black-lover.m4a" : "/lab/black-lover.mp3");
    this.audio.loop = true;
    this.audio.preload = "auto";
    this.audio.addEventListener("play", () => this.set(() => (this.playing = true)));
    this.audio.addEventListener("pause", () => this.set(() => (this.playing = false)));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** A new object each change, for useSyncExternalStore. */
  private snapshot = { playing: false, ...this.prefs };
  getSnapshot = () => this.snapshot;
  private set(change: () => void) {
    change();
    this.snapshot = { playing: this.playing, ...this.prefs };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {}
    this.applyVolume();
    for (const l of this.listeners) l();
  }

  /** The audio graph needs a user gesture, so it's built on first play. */
  private graph() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain = this.ctx.createGain();
    source.connect(this.analyser).connect(this.gain).connect(this.ctx.destination);
    this.applyVolume();
  }

  private applyVolume() {
    if (this.gain) this.gain.gain.value = this.prefs.muted ? 0 : this.prefs.volume;
  }

  async play() {
    this.graph();
    await this.ctx!.resume();
    await this.audio.play().catch(() => {});
    this.set(() => (this.prefs.off = false));
  }
  pause() {
    this.audio.pause();
    this.set(() => (this.prefs.off = true));
  }
  setVolume(volume: number) {
    this.set(() => {
      this.prefs.volume = volume;
      if (volume > 0) this.prefs.muted = false;
    });
  }
  setMuted(muted: boolean) {
    this.set(() => (this.prefs.muted = muted));
  }

  levels(source: Source): Levels {
    if (!this.playing) return SILENT;
    const time = this.audio.currentTime;
    return source === "live" ? this.live(time) : this.fromMap(time);
  }

  private live(time: number): Levels {
    if (!this.analyser || !this.ctx) return SILENT;
    this.analyser.getByteFrequencyData(this.bins);
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (lo: number, hi: number) => {
      const a = Math.max(1, Math.round(lo / hz));
      const b = Math.min(this.bins.length, Math.round(hi / hz));
      let sum = 0;
      for (let i = a; i < b; i++) sum += this.bins[i]!;
      return sum / Math.max(1, b - a) / 255;
    };
    const bass = band(0, 150);
    const mid = band(150, 2000);
    const high = band(2000, 11000);
    this.bassHistory.push(bass);
    if (this.bassHistory.length > 60) this.bassHistory.shift();
    const avg = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
    const now = performance.now();
    const beat = bass > 0.3 && bass > avg * 1.25 && now - this.lastLiveBeat > 250;
    if (beat) this.lastLiveBeat = now;
    // The analyser reads quietly; stretch it to use the whole 0–1.
    return { bass: Math.min(1, bass * 1.3), mid: Math.min(1, mid * 1.8), high: Math.min(1, high * 3), beat, time };
  }

  private fromMap(time: number): Levels {
    const i = Math.min(this.map.bass.length - 1, Math.floor(time / this.map.step));
    // A beat if one fell between the last frame and this one (looping resets).
    const from = time < this.lastMapTime ? -1 : this.lastMapTime;
    const beat = this.map.beats.some((t) => t > from && t <= time);
    this.lastMapTime = time;
    return { bass: this.map.bass[i]! / 100, mid: this.map.mid[i]! / 100, high: this.map.high[i]! / 100, beat, time };
  }
}

export const music = new Music();

/** Music state for the controls. */
export function useMusic() {
  return useSyncExternalStore(music.subscribe, music.getSnapshot);
}

/**
 * Start the music on the first click or key press anywhere (browsers allow
 * sound only after one), unless it was switched off last time.
 */
export function useStartOnFirstGesture() {
  useEffect(() => {
    if (music.prefs.off) return;
    const start = () => {
      music.play();
      remove();
    };
    const remove = () => {
      removeEventListener("pointerdown", start);
      removeEventListener("keydown", start);
    };
    addEventListener("pointerdown", start);
    addEventListener("keydown", start);
    return remove;
  }, []);
}

// One animation loop for everything that moves to the music.
type FrameListener = (levels: Record<Source, Levels>, dt: number) => void;
const frameListeners = new Set<FrameListener>();
let running = false;
let last = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  const levels = { live: music.levels("live"), map: music.levels("map") };
  for (const f of frameListeners) f(levels, dt);
  if (frameListeners.size > 0) requestAnimationFrame(loop);
  else running = false;
}

/** Call `listener` every animation frame with both readings of the music. */
export function useFrame(listener: FrameListener) {
  useEffect(() => {
    frameListeners.add(listener);
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
    return () => {
      frameListeners.delete(listener);
    };
  }, [listener]);
}

/** Which reading drives the animation, chosen on the page. */
export function useSourceChoice() {
  return useState<Source>("map");
}

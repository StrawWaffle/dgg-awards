import { useCallback, useEffect, useRef, useState } from "react";
import { Emote } from "@/lab/Emote";
import { type Clip, ClipPlayer } from "@/lab/ClipPlayer";
import { Sketch, useDrawnLook } from "@/lab/sketch";
import { type FeedStatus, liveFeed, simulatedFeed } from "@/lab/chatFeed";
import { type Levels, type Source, useFrame } from "@/lab/music";
import type { ChatSummary } from "@/server/lab/chat-aggregator";

type Npc = {
  el: HTMLDivElement;
  emoteEl: HTMLSpanElement;
  bubble: HTMLDivElement;
  nick: string;
  emote: string;
  x: number;
  /** 0 (back) to 1 (front): lane on the floor. */
  depth: number;
  vx: number;
  hop: number;
  /** A small bounce on each beat, apart from the hop on the one. */
  bob: number;
  opacity: number;
  /** Walking in from an edge to `targetX`, then wandering. */
  entering: boolean;
  targetX: number;
  bornAt: number;
  /** Walking off; removed once it's off stage or faded out. */
  leaving: boolean;
  lastSeen: number;
  bubbleUntil: number;
  clapUntil: number;
  /** The emote to go back to after clapping. */
  restore: string;
  /** While a clip plays: the spot beside it to walk to and sit at. */
  parkX?: number;
};

/** One line in the chat column: someone's emote, a verified message, or a combo. */
type Line =
  | { id: number; kind: "emote"; nick: string; flair: string | null; emote: string }
  | { id: number; kind: "said"; nick: string; flair: string | null; text: string }
  | { id: number; kind: "combo"; emote: string; count: number };

/** A character stays at least this long before it can be sent off to make room. */
const MIN_STAY_MS = 12_000;
/** New characters a second, at most: the cast changes gradually, not in a churn. */
const ARRIVALS_PER_SECOND = 2;

function setEmote(npc: Npc, emote: string) {
  if (npc.emote === emote) return;
  npc.emote = emote;
  npc.emoteEl.className = `emote ${emote}`;
}

const nickClass = (flair: string | null) => `nick${flair ? ` nick-${flair}` : ""}`;

/**
 * The presentation's big screen: chatters as their emotes, walking about,
 * hopping to the music, clapping when someone wins, beside a chat column.
 * Characters are plain DOM elements moved each frame, never React state, and
 * there are at most `max` of them; the busiest chat costs the same as a quiet
 * one. The chat column and the numbers update four times a second.
 */
export function Stage({ source, emotes, chatOpen }: { source: Source; emotes: string[]; chatOpen: boolean }) {
  const floor = useRef<HTMLDivElement>(null);
  const npcs = useRef(new Map<string, Npc>());
  const [feed, setFeed] = useState<"sim" | "live">("sim");
  const [rate, setRate] = useState(300);
  const [emoteShare, setEmoteShare] = useState(0.5);
  const [max, setMax] = useState(60);
  const [names, setNames] = useState(true);
  const [showSaid, setShowSaid] = useState(true);
  const [status, setStatus] = useState<FeedStatus>({ connected: false, note: "" });
  const [stats, setStats] = useState({ fps: 0, npcs: 0, perSecond: 0, emoteOnly: 0, ingestMs: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [playing, setPlaying] = useState<Clip | null>(null);
  /** The clip being raised away after it's closed. */
  const [raising, setRaising] = useState<Clip | null>(null);
  /** While a clip plays the cast holds still beside it: nobody new, no bubbles. */
  const clipOn = useRef(false);
  clipOn.current = !!playing;
  const clipBox = useRef<HTMLDivElement>(null);
  // The controls' height, so the clip and the cast stay clear of them.
  const controls = useRef<HTMLDivElement>(null);
  const controlsH = useRef(0);
  const [controlsHeight, setControlsHeight] = useState(0);
  useEffect(() => {
    const el = controls.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      controlsH.current = el.offsetHeight;
      setControlsHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    fetch("/api/nominees")
      .then((r) => r.json())
      .then((data) =>
        setClips(
          Array.isArray(data)
            ? data.flatMap((c: any) =>
                c.options
                  .filter((o: any) => o.clipUrl)
                  .map((o: any) => ({
                    title: `${o.title} · ${c.title}`,
                    clipUrl: o.clipUrl,
                    thumbnailUrl: o.thumbnailUrl,
                    url: o.url,
                    linkType: o.linkType,
                    clipStart: o.clipStart,
                  })),
              )
            : [],
        ),
      )
      .catch(() => setClips([]));
  }, []);
  const drawn = useDrawnLook();
  const settings = useRef({ rate, emoteShare, max, names, showSaid });
  settings.current = { rate, emoteShare, max, names, showSaid };
  const fps = useRef({ frames: 0, since: performance.now(), value: 0 });
  const clapUntil = useRef(0);
  const lineId = useRef(0);
  /** Arrival allowance, refilled over time (a token bucket). */
  const arrivals = useRef({ tokens: 4, at: performance.now() });
  /** The chat line of the combo still running, to count it up in place. */
  const liveCombo = useRef<{ id: number; emote: string } | null>(null);

  const spawn = useCallback((nick: string, emote: string, flair: string | null) => {
    const box = floor.current!;
    const el = document.createElement("div");
    el.className = "absolute left-0 top-0 flex flex-col items-center will-change-transform";
    const bubble = document.createElement("div");
    bubble.className = "cozy-panel mb-1 hidden max-w-52 px-3 py-1.5 text-xs font-bold";
    const label = document.createElement("span");
    label.className = `${nickClass(flair)} mb-0.5 whitespace-nowrap rounded-full px-1.5 text-[11px]`;
    label.style.background = "color-mix(in oklab, var(--panel) 75%, transparent)";
    label.textContent = nick;
    const emoteEl = document.createElement("span");
    emoteEl.className = `emote ${emote}`;
    el.append(bubble, label, emoteEl);
    box.append(el);
    el.style.opacity = "0";
    // In from the left or the right edge, walking onto the stage.
    const fromLeft = Math.random() < 0.5;
    const width = box.clientWidth;
    const npc: Npc = {
      el,
      emoteEl,
      bubble,
      nick,
      emote,
      x: fromLeft ? -50 : box.clientWidth + 10,
      depth: Math.random(),
      vx: (fromLeft ? 1 : -1) * (70 + Math.random() * 40),
      targetX: 40 + Math.random() * Math.max(40, width - 120),
      bornAt: performance.now(),
      hop: 0,
      bob: 0,
      opacity: 0,
      entering: true,
      leaving: false,
      lastSeen: performance.now(),
      bubbleUntil: 0,
      clapUntil: 0,
      restore: emote,
    };
    npcs.current.set(nick, npc);
    return npc;
  }, []);

  /** Walk off towards the nearest edge, fading; the frame loop removes it. */
  const leave = useCallback((npc: Npc) => {
    if (npc.leaving) return;
    npc.leaving = true;
    npc.entering = false;
    const width = floor.current?.clientWidth ?? 0;
    npc.vx = (npc.x < width / 2 ? -1 : 1) * 130;
    // Its nick is free again at once, so a returning chatter gets a new character.
    npcs.current.delete(npc.nick);
    leavingNpcs.current.add(npc);
  }, []);
  const leavingNpcs = useRef(new Set<Npc>());

  const onSummary = useCallback(
    (summary: ChatSummary, feedStatus: FeedStatus) => {
      setStatus(feedStatus);
      const now = performance.now();
      const all = npcs.current;
      const bucket = arrivals.current;
      bucket.tokens = Math.min(4, bucket.tokens + ((now - bucket.at) / 1000) * ARRIVALS_PER_SECOND);
      bucket.at = now;
      for (const event of summary.events) {
        let npc = all.get(event.nick);
        // During a clip only the characters already out can change emote.
        if (!npc && clipOn.current) continue;
        if (!npc) {
          // Arrivals are paced, and nobody is sent off before they've had
          // their moment; if neither allows it, this chatter isn't shown.
          if (bucket.tokens < 1) continue;
          if (all.size >= settings.current.max) {
            let oldest: Npc | null = null;
            for (const n of all.values()) {
              if (n.entering || now - n.bornAt < MIN_STAY_MS) continue;
              if (!oldest || n.lastSeen < oldest.lastSeen) oldest = n;
            }
            if (!oldest) continue;
            leave(oldest);
          }
          bucket.tokens -= 1;
          npc = spawn(event.nick, event.emote, event.flair);
          if (clapUntil.current > now) npc.clapUntil = clapUntil.current;
        }
        // During a winner moment everyone claps, newcomers too.
        setEmote(npc, npc.clapUntil > now ? "Klappa" : event.emote);
        if (npc.clapUntil > now) npc.restore = event.emote;
        if (!npc.entering && !clipOn.current) npc.hop = Math.max(npc.hop, 0.6);
        npc.lastSeen = now;
      }
      const said = settings.current.showSaid ? summary.said : [];
      // No speech bubbles over a clip.
      if (!clipOn.current) for (const s of said) {
        const npc = all.get(s.nick) ?? spawn(s.nick, "PepoG", s.flair);
        npc.bubble.textContent = s.text;
        npc.bubble.classList.remove("hidden");
        npc.bubbleUntil = now + 5000;
        npc.lastSeen = now;
      }
      // The chat column: a few of this window's characters, and what verified
      // people said, newest at the bottom.
      const added: Line[] = [
        ...summary.events
          .slice(0, 2)
          .map((e) => ({ id: lineId.current++, kind: "emote" as const, nick: e.nick, flair: e.flair, emote: e.emote })),
        ...said.map((s) => ({ id: lineId.current++, kind: "said" as const, nick: s.nick, flair: s.flair, text: s.text })),
      ];
      // Combos as their own lines, as chat shows them: one that's still going
      // counts up in place; one that ended in between gets its final count.
      const counts = new Map<number, number>();
      for (const e of summary.ended) {
        if (liveCombo.current?.emote === e.emote) {
          counts.set(liveCombo.current.id, e.count);
          liveCombo.current = null;
        } else added.push({ id: lineId.current++, kind: "combo", emote: e.emote, count: e.count });
      }
      if (summary.combo) {
        if (liveCombo.current?.emote === summary.combo.emote) counts.set(liveCombo.current.id, summary.combo.count);
        else {
          const id = lineId.current++;
          liveCombo.current = { id, emote: summary.combo.emote };
          added.push({ id, kind: "combo", emote: summary.combo.emote, count: summary.combo.count });
        }
      } else liveCombo.current = null;
      if (added.length > 0 || counts.size > 0) {
        setLines((l) =>
          [...l.map((line) => (line.kind === "combo" && counts.has(line.id) ? { ...line, count: counts.get(line.id)! } : line)), ...added].slice(-60),
        );
      }
      // Everyone on the combo's emote jumps with it.
      if (summary.combo && summary.combo.count >= 3 && !clipOn.current) {
        for (const n of all.values()) if (n.emote === summary.combo.emote && !n.entering) n.hop = 1.4;
      }
      // Characters walk off after a minute of silence.
      if (!clipOn.current) for (const n of [...all.values()]) if (now - n.lastSeen > 60_000) leave(n);
      setStats((s) => ({
        fps: fps.current.value,
        npcs: all.size,
        perSecond: Math.round(s.perSecond * 0.7 + summary.messages * 4 * 0.3),
        emoteOnly: Math.round(s.emoteOnly * 0.7 + summary.emoteOnly * 4 * 0.3),
        ingestMs: feedStatus.ingestMs ?? 0,
      }));
    },
    [leave, spawn],
  );

  useEffect(() => {
    if (feed === "live") return liveFeed(onSummary);
    if (emotes.length === 0) return;
    return simulatedFeed(emotes, () => settings.current.rate, () => settings.current.emoteShare, onSummary);
  }, [feed, emotes, onSummary]);

  // Everyone walks off and the chat clears when switching feeds.
  useEffect(() => {
    for (const n of [...npcs.current.values()]) leave(n);
    setLines([]);
  }, [feed, leave]);

  // Keep the chat column scrolled to the newest line.
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [lines]);

  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onFrame = useCallback((levels: Record<Source, Levels>, dt: number) => {
    const box = floor.current;
    if (!box) return;
    const f = fps.current;
    f.frames++;
    const now = performance.now();
    if (now - f.since > 1000) {
      f.value = Math.round((f.frames * 1000) / (now - f.since));
      f.frames = 0;
      f.since = now;
    }
    const music = levels[sourceRef.current];
    const width = box.clientWidth;
    const height = box.clientHeight;
    const showNames = settings.current.names;
    const everyone = [...npcs.current.values(), ...leavingNpcs.current];
    const still = clipOn.current;
    // The floor runs from the horizon to just above the controls.
    const top = height * 0.42;
    const depthRange = Math.max(40, height - controlsH.current - 70 - top);
    for (const n of everyone) {
      // The music: a jump on the one of each bar, a little bob on the others.
      if (!n.entering && !n.leaving && !still) {
        if (music.downbeat) n.hop = Math.max(n.hop, 0.75);
        else if (music.beat) n.bob = 1;
      }
      n.x += n.vx * dt;
      if (n.parkX !== undefined) {
        // Walking to the side of the clip, then sitting still there.
        if ((n.vx >= 0 && n.x >= n.parkX) || (n.vx <= 0 && n.x <= n.parkX)) {
          n.x = n.parkX;
          n.vx = 0;
        }
      } else if (n.entering) {
        // Walk to their spot, then slow to a wander.
        if ((n.vx > 0 && n.x >= n.targetX) || (n.vx < 0 && n.x <= n.targetX)) {
          n.entering = false;
          n.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
        }
      } else if (!n.leaving && (n.x < 0 || n.x > width - 40)) {
        n.vx = -n.vx;
        n.x = Math.max(0, Math.min(width - 40, n.x));
      }
      n.opacity = n.leaving ? n.opacity - dt * 1.2 : Math.min(1, n.opacity + dt * 2.5);
      if (n.leaving && (n.opacity <= 0 || n.x < -80 || n.x > width + 40)) {
        n.el.remove();
        leavingNpcs.current.delete(n);
        continue;
      }
      n.hop = Math.max(0, n.hop - dt * 2.4);
      n.bob = Math.max(0, n.bob - dt * 7);
      // On the grass: back row higher and smaller, front row lower and bigger.
      const y = top + n.depth * depthRange - Math.sin(n.hop * Math.PI) * 30 * n.hop - n.bob * 5;
      const scale = 0.7 + n.depth * 0.6;
      // The bob squashes a little, like landing.
      n.el.style.transform = `translate3d(${n.x}px, ${y}px, 0) scale(${scale * (1 + n.bob * 0.04)}, ${scale * (1 - n.bob * 0.06)})`;
      n.el.style.opacity = String(Math.max(0, n.opacity));
      n.el.style.zIndex = String(Math.round(n.depth * 100));
      (n.el.children[1] as HTMLElement).style.display = showNames ? "" : "none";
      if (n.bubbleUntil && now > n.bubbleUntil) {
        n.bubble.classList.add("hidden");
        n.bubbleUntil = 0;
      }
      if (n.clapUntil && now > n.clapUntil) {
        n.clapUntil = 0;
        setEmote(n, n.restore);
      }
    }
  }, []);
  useFrame(onFrame);

  // A clip lowers in: everyone walks out of its way, left or right, and sits.
  useEffect(() => {
    if (!playing) {
      for (const n of npcs.current.values()) {
        if (n.parkX === undefined) continue;
        n.parkX = undefined;
        n.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22);
      }
      return;
    }
    const frame = requestAnimationFrame(() => {
      const box = floor.current;
      const clip = clipBox.current;
      if (!box || !clip) return;
      const b = box.getBoundingClientRect();
      const c = clip.getBoundingClientRect();
      const left = c.left - b.left;
      const right = c.right - b.left;
      const width = b.width;
      for (const n of npcs.current.values()) {
        const toLeft = n.x + 20 < (left + right) / 2;
        const lo = toLeft ? 8 : right + 12;
        const hi = toLeft ? left - 56 : width - 48;
        const x = lo <= hi ? lo + Math.random() * (hi - lo) : toLeft ? Math.max(0, hi) : Math.min(width - 40, lo);
        n.entering = false;
        n.parkX = x;
        n.vx = (x >= n.x ? 1 : -1) * 150;
        n.bubble.classList.add("hidden");
        n.bubbleUntil = 0;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  // Read from a ref: the end-of-clip timer may fire after it was closed by hand.
  const closeClip = () => {
    const clip = playingRef.current;
    if (!clip) return;
    playingRef.current = null;
    setRaising(clip);
    setPlaying(null);
    setTimeout(() => setRaising(null), 650);
  };
  const shownClip = playing ?? raising;

  const winnerMoment = () => {
    setWinner("Destiny Makes a Joke");
    const until = performance.now() + 4000;
    clapUntil.current = until;
    for (const n of npcs.current.values()) {
      if (!n.clapUntil) n.restore = n.emote;
      setEmote(n, "Klappa");
      n.clapUntil = until;
      if (!n.entering) n.hop = 1;
    }
    setTimeout(() => setWinner(null), 4000);
  };

  return (
    <div className="flex" style={{ height: "calc(100dvh - var(--lab-header, 64px))" }}>
      {/* The stage fills the window; the controls sit over its bottom edge. */}
      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{ background: "linear-gradient(to bottom, var(--sky-top), var(--sky-bottom))" }}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-[52%]"
          style={{ background: "var(--ground)", borderTop: "6px solid var(--ground-edge)", borderRadius: "50% 50% 0 0 / 28px 28px 0 0" }}
        />
        <div className="absolute inset-x-0 top-[5%] z-[200] text-center">
          <Sketch className="inline-block" pad={3} radius={20} boil={!!winner} drawOn>
            <div
              key={winner ?? "award"}
              className={`${drawn ? "rounded-[20px]" : "cozy-panel"} lab-pop inline-block px-7 py-3 text-2xl font-black sm:text-4xl`}
              style={drawn ? { background: "var(--panel)" } : undefined}
            >
              {winner ? (
                <span className="flex items-center gap-3">
                  <Emote name="CHEERSTINY" size={1.1} title="" /> {winner}
                </span>
              ) : (
                "Omegalul of the Year"
              )}
            </div>
          </Sketch>
        </div>
        {shownClip && (
          // Lowered from the top to just above the controls, and raised away.
          <div
            className="pointer-events-none absolute inset-x-4 z-[150] flex justify-center"
            style={{ top: "calc(5% + 100px)", bottom: controlsHeight + 32 }}
          >
            <div
              key={shownClip.clipUrl}
              ref={clipBox}
              className={`pointer-events-auto aspect-[16/10] h-full max-w-full ${playing ? "lab-lower" : "lab-raise"}`}
            >
              <ClipPlayer clip={shownClip} fill onEnded={() => setTimeout(closeClip, 1500)} />
            </div>
          </div>
        )}
        <div ref={floor} className="pointer-events-none absolute inset-0 z-[160]" />
        <div className="cozy-chip absolute top-3 left-3 z-[200] font-mono text-[11px]!">
          {stats.fps} fps · {stats.npcs} on stage
        </div>

        {/* The presenter's controls, over the bottom of the stage. */}
        <div ref={controls} className="absolute inset-x-4 bottom-4 z-[300] mx-auto max-w-4xl">
          <div className="cozy-panel space-y-3 p-4">
            {settingsOpen && (
              <div className="grid gap-3 rounded-2xl p-4 text-sm font-bold sm:grid-cols-2" style={{ background: "var(--cream)" }}>
                <label className="flex items-center gap-2">
                  Chat from
                  <select value={feed} onChange={(e) => setFeed(e.currentTarget.value as "sim" | "live")} className="cozy-input py-1!">
                    <option value="sim">Simulator</option>
                    <option value="live">Live destiny.gg chat</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  Characters at most
                  <input type="range" min={10} max={400} step={10} value={max} onChange={(e) => setMax(Number(e.currentTarget.value))} className="cozy-range" />
                  <span className="w-9 tabular-nums">{max}</span>
                </label>
                {feed === "sim" && (
                  <>
                    <label className="flex items-center gap-2">
                      Messages a second
                      <input type="range" min={1} max={5000} step={1} value={rate} onChange={(e) => setRate(Number(e.currentTarget.value))} className="cozy-range" />
                      <span className="w-12 tabular-nums">{rate}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      Emote-only
                      <input type="range" min={0} max={1} step={0.05} value={emoteShare} onChange={(e) => setEmoteShare(Number(e.currentTarget.value))} className="cozy-range" />
                      <span className="w-10 tabular-nums">{Math.round(emoteShare * 100)}%</span>
                    </label>
                  </>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={names} onChange={(e) => setNames(e.currentTarget.checked)} /> Names over characters
                </label>
                <label className="flex items-center gap-2" title="The Verified flair, Notable, Broadcaster and mods">
                  <input type="checkbox" checked={showSaid} onChange={(e) => setShowSaid(e.currentTarget.checked)} /> Verified messages
                </label>
                <p className="sm:col-span-2" style={{ color: "var(--muted)" }}>
                  {status.note}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="cozy-chip coral">Presenting</span>
              <span className="mr-auto text-xl font-black">Omegalul of the Year</span>
              <span className="cozy-chip">{stats.perSecond.toLocaleString()} msg/s</span>
              <span className="cozy-chip green">{feed === "live" ? "Live chat" : "Simulator"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="cozy-btn primary" onClick={winnerMoment}>
                <Emote name="Klappa" size={0.6} title="" /> Winner moment
              </button>
              <button
                type="button"
                className="cozy-btn"
                disabled={clips.length === 0}
                title={clips.length === 0 ? "No nominee has a built clip yet; build one in the admin editor" : undefined}
                onClick={() => (playing ? closeClip() : !raising && setPlaying(clips[Math.floor(Math.random() * clips.length)]!))}
              >
                {playing ? "Close the clip" : `Play a clip${clips.length ? ` (${clips.length})` : ""}`}
              </button>
              <button type="button" className="cozy-btn" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>
                Stage settings
              </button>
              {feed === "sim" && (
                <span className="cozy-chip ml-auto">
                  {stats.emoteOnly.toLocaleString()} emote-only/s · aggregator {stats.ingestMs.toFixed(1)} ms / ¼ s
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The chat column, toggled from the top bar. */}
      {chatOpen && (
        <aside
          className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l-2"
          style={{ background: "var(--panel)", borderColor: "var(--panel-border)" }}
        >
          <div className="flex items-center justify-between border-b-2 px-4 py-3" style={{ borderColor: "var(--panel-border)" }}>
            <span className="font-black">Chat</span>
            <span className={`cozy-chip ${status.connected ? "green" : ""}`}>{status.connected ? "connected" : "waiting"}</span>
          </div>
          <div ref={chat} className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
            {lines.map((l) =>
              l.kind === "combo" ? (
                // As chat shows a combo: the emote, the count, and HITS or, from 5, C-C-C-COMBO.
                <div key={l.id} className="flex items-center gap-2 px-1.5 py-1">
                  <Emote name={l.emote} size={0.95} />
                  <span className="text-sm font-black">{l.count}×</span>
                  <span key={l.count} className="lab-combo text-lg font-black italic">
                    {l.count >= 5 ? "C-C-C-COMBO" : "HITS"}
                  </span>
                </div>
              ) : (
                <div
                  key={l.id}
                  className="rounded-lg px-1.5 py-0.5"
                  style={l.kind === "said" ? { background: "var(--highlight)", borderLeft: "3px solid var(--primary-shadow)" } : undefined}
                >
                  <span className={nickClass(l.flair)}>{l.nick}</span>:{" "}
                  {l.kind === "emote" ? <Emote name={l.emote} size={0.85} /> : <span className="font-semibold">{l.text}</span>}
                </div>
              ),
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

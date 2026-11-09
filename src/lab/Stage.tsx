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
export function Stage({ source, emotes }: { source: Source; emotes: string[] }) {
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
        if (!npc.entering) npc.hop = Math.max(npc.hop, 0.6);
        npc.lastSeen = now;
      }
      const said = settings.current.showSaid ? summary.said : [];
      for (const s of said) {
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
      if (summary.combo && summary.combo.count >= 3) {
        for (const n of all.values()) if (n.emote === summary.combo.emote && !n.entering) n.hop = 1.4;
      }
      // Characters walk off after a minute of silence.
      for (const n of [...all.values()]) if (now - n.lastSeen > 60_000) leave(n);
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
    for (const n of everyone) {
      // The music: a jump on the one of each bar, a little bob on the others.
      if (!n.entering && !n.leaving) {
        if (music.downbeat) n.hop = Math.max(n.hop, 0.75);
        else if (music.beat) n.bob = 1;
      }
      n.x += n.vx * dt;
      if (n.entering) {
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
      const y =
        height * 0.42 + n.depth * height * 0.42 - Math.sin(n.hop * Math.PI) * 30 * n.hop - n.bob * 5;
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
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* The stage, framed like a stream embed; in the drawn look, by hand. */}
        <Sketch pad={4} radius={24} strokeWidth={3} boil roughness={1.6}>
        <div className={drawn ? "rounded-[22px] p-2" : "cozy-panel p-2"} style={drawn ? { background: "var(--panel)" } : undefined}>
          <div
            className="relative aspect-video w-full overflow-hidden rounded-[16px]"
            style={{ background: "linear-gradient(to bottom, var(--sky-top), var(--sky-bottom))" }}
          >
            <div
              className="absolute inset-x-0 bottom-0 h-[52%]"
              style={{ background: "var(--ground)", borderTop: "6px solid var(--ground-edge)", borderRadius: "50% 50% 0 0 / 28px 28px 0 0" }}
            />
            <div className="absolute inset-x-0 top-[7%] z-[200] text-center">
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
            {playing && (
              <div key={playing.clipUrl} className="lab-pop absolute inset-x-[16%] top-[22%] z-[150]">
                <ClipPlayer clip={playing} onEnded={() => setTimeout(() => setPlaying(null), 1500)} />
              </div>
            )}
            <div ref={floor} className="pointer-events-none absolute inset-0 z-[160]" />
            <div className="cozy-chip absolute top-3 left-3 z-[200] font-mono text-[11px]!">
              {stats.fps} fps · {stats.npcs} on stage
            </div>
          </div>
        </div>
        </Sketch>

        {/* Under the stage: what's on, and the controls. */}
        <div className="cozy-panel space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <span className="cozy-chip coral">Presenting</span>
            <span className="cozy-chip">{stats.perSecond.toLocaleString()} msg/s</span>
            <span className="cozy-chip">{stats.emoteOnly.toLocaleString()} emote-only/s</span>
            <span className="cozy-chip green">{feed === "live" ? "Live chat" : "Simulator"}</span>
            {feed === "sim" && <span className="cozy-chip">aggregator {stats.ingestMs.toFixed(1)} ms / ¼ s</span>}
          </div>
          <h2 className="text-3xl font-black">Omegalul of the Year</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="cozy-btn primary" onClick={winnerMoment}>
              <Emote name="Klappa" size={0.6} title="" /> Winner moment
            </button>
            <button
              type="button"
              className="cozy-btn"
              disabled={clips.length === 0}
              title={clips.length === 0 ? "No nominee has a built clip yet; build one in the admin editor" : undefined}
              onClick={() => setPlaying(playing ? null : clips[Math.floor(Math.random() * clips.length)]!)}
            >
              {playing ? "Close the clip" : `Play a clip${clips.length ? ` (${clips.length})` : ""}`}
            </button>
            <button type="button" className="cozy-btn" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>
              Stage settings
            </button>
          </div>
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
        </div>
      </div>

      {/* The chat column. */}
      <aside className="cozy-panel flex h-[min(78vh,760px)] flex-col overflow-hidden">
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
    </div>
  );
}

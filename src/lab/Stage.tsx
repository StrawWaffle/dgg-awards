import { useCallback, useEffect, useRef, useState } from "react";
import { Emote } from "@/lab/Emote";
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
  lastSeen: number;
  bubbleUntil: number;
  clapUntil: number;
  /** The emote to go back to after clapping. */
  restore: string;
};

/** One line in the chat column. */
type Line = { id: number; nick: string; flair: string | null; emote?: string; text?: string };

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
  const [combo, setCombo] = useState<{ emote: string; count: number } | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const drawn = useDrawnLook();
  const settings = useRef({ rate, emoteShare, max, names, showSaid });
  settings.current = { rate, emoteShare, max, names, showSaid };
  const fps = useRef({ frames: 0, since: performance.now(), value: 0 });
  const clapUntil = useRef(0);
  const lineId = useRef(0);

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
    const npc: Npc = {
      el,
      emoteEl,
      bubble,
      nick,
      emote,
      x: Math.random() * box.clientWidth,
      depth: Math.random(),
      vx: (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 35),
      hop: 1,
      lastSeen: performance.now(),
      bubbleUntil: 0,
      clapUntil: 0,
      restore: emote,
    };
    npcs.current.set(nick, npc);
    return npc;
  }, []);

  const remove = useCallback((npc: Npc) => {
    npc.el.remove();
    npcs.current.delete(npc.nick);
  }, []);

  const onSummary = useCallback(
    (summary: ChatSummary, feedStatus: FeedStatus) => {
      setStatus(feedStatus);
      const now = performance.now();
      const all = npcs.current;
      for (const event of summary.events) {
        let npc = all.get(event.nick);
        if (!npc) {
          if (all.size >= settings.current.max) {
            // Make room: whoever has been quiet longest goes.
            let oldest: Npc | null = null;
            for (const n of all.values()) if (!oldest || n.lastSeen < oldest.lastSeen) oldest = n;
            if (oldest) remove(oldest);
          }
          npc = spawn(event.nick, event.emote, event.flair);
          if (clapUntil.current > now) npc.clapUntil = clapUntil.current;
        }
        // During a winner moment everyone claps, newcomers too.
        setEmote(npc, npc.clapUntil > now ? "Klappa" : event.emote);
        if (npc.clapUntil > now) npc.restore = event.emote;
        npc.hop = 1;
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
        ...summary.events.slice(0, 6).map((e) => ({ id: lineId.current++, nick: e.nick, flair: e.flair, emote: e.emote })),
        ...said.map((s) => ({ id: lineId.current++, nick: s.nick, flair: s.flair, text: s.text })),
      ];
      if (added.length > 0) setLines((l) => [...l, ...added].slice(-40));
      if (summary.combo && summary.combo.count >= 3) {
        setCombo(summary.combo);
        for (const n of all.values()) if (n.emote === summary.combo.emote) n.hop = 1.4;
      } else setCombo(null);
      // Characters leave after a minute of silence.
      for (const n of all.values()) if (now - n.lastSeen > 60_000) remove(n);
      setStats((s) => ({
        fps: fps.current.value,
        npcs: all.size,
        perSecond: Math.round(s.perSecond * 0.7 + summary.messages * 4 * 0.3),
        emoteOnly: Math.round(s.emoteOnly * 0.7 + summary.emoteOnly * 4 * 0.3),
        ingestMs: feedStatus.ingestMs ?? 0,
      }));
    },
    [remove, spawn],
  );

  useEffect(() => {
    if (feed === "live") return liveFeed(onSummary);
    if (emotes.length === 0) return;
    return simulatedFeed(emotes, () => settings.current.rate, () => settings.current.emoteShare, onSummary);
  }, [feed, emotes, onSummary]);

  // A clean stage and chat when switching feeds.
  useEffect(() => {
    for (const n of [...npcs.current.values()]) remove(n);
    setLines([]);
  }, [feed, remove]);

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
    for (const n of npcs.current.values()) {
      if (music.beat) n.hop = Math.max(n.hop, 0.5);
      n.x += n.vx * dt;
      if (n.x < 0 || n.x > width - 40) {
        n.vx = -n.vx;
        n.x = Math.max(0, Math.min(width - 40, n.x));
      }
      n.hop = Math.max(0, n.hop - dt * 3);
      // On the grass: back row higher and smaller, front row lower and bigger.
      const y = height * 0.42 + n.depth * height * 0.42 - Math.sin(n.hop * Math.PI) * 26 * n.hop;
      const scale = 0.7 + n.depth * 0.6;
      n.el.style.transform = `translate3d(${n.x}px, ${y}px, 0) scale(${scale})`;
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
      n.hop = 1;
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
                  className={`${drawn ? "rounded-[20px]" : "cozy-panel"} inline-block px-7 py-3 text-2xl font-black sm:text-4xl`}
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
            <div ref={floor} className="absolute inset-0" />
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
          {lines.map((l) => (
            <div
              key={l.id}
              className="rounded-lg px-1.5 py-0.5"
              style={l.text ? { background: "var(--highlight)", borderLeft: "3px solid var(--primary-shadow)" } : undefined}
            >
              <span className={nickClass(l.flair)}>{l.nick}</span>:{" "}
              {l.emote ? <Emote name={l.emote} size={0.85} /> : <span className="font-semibold">{l.text}</span>}
            </div>
          ))}
        </div>
        <div className="h-12 border-t-2 px-4 py-2" style={{ borderColor: "var(--panel-border)" }}>
          {combo && (
            <div key={combo.count} className="lab-combo flex items-center gap-2 text-xl font-black italic">
              <Emote name={combo.emote} size={0.9} title="" />
              <span className="text-sm not-italic">{combo.count}×</span> COMBO
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

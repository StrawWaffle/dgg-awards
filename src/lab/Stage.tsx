import { useCallback, useEffect, useRef, useState } from "react";
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

const FLAIR_COLOURS: Record<string, string> = {
  admin: "#ff4b4b",
  moderator: "#ffc000",
  flair12: "#e9a8ff",
  flair20: "#47b8ff",
  flair2: "#89d0ff",
  flair42: "#ff8a38",
  flair8: "#bd8cff",
  flair3: "#5fa8ff",
  flair1: "#69e0a8",
  flair13: "#8dd2ff",
  subscriber: "#7fb2ff",
};

function setEmote(npc: Npc, emote: string) {
  if (npc.emote === emote) return;
  npc.emote = emote;
  npc.emoteEl.className = `emote ${emote}`;
}

/**
 * The presentation stage: chatters as their emotes, walking about, hopping
 * to the music, clapping when someone wins. Characters are plain DOM elements
 * moved each frame, never React state, and there are at most `max` of them;
 * the busiest chat costs the same as a quiet one.
 */
export function Stage({ source, emotes }: { source: Source; emotes: string[] }) {
  const floor = useRef<HTMLDivElement>(null);
  const npcs = useRef(new Map<string, Npc>());
  const [feed, setFeed] = useState<"sim" | "live">("sim");
  const [rate, setRate] = useState(300);
  const [emoteShare, setEmoteShare] = useState(0.5);
  const [max, setMax] = useState(150);
  const [names, setNames] = useState(true);
  const [showSaid, setShowSaid] = useState(false);
  const [status, setStatus] = useState<FeedStatus>({ connected: false, note: "" });
  const [stats, setStats] = useState({ fps: 0, npcs: 0, perSecond: 0, emoteOnly: 0, ingestMs: 0 });
  const [combo, setCombo] = useState<{ emote: string; count: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const settings = useRef({ rate, emoteShare, max, names, showSaid });
  settings.current = { rate, emoteShare, max, names, showSaid };
  const fps = useRef({ frames: 0, since: performance.now(), value: 0 });
  const clapUntil = useRef(0);

  const spawn = useCallback((nick: string, emote: string, flair: string | null) => {
    const box = floor.current!;
    const el = document.createElement("div");
    el.className = "absolute left-0 top-0 flex flex-col items-center will-change-transform";
    const bubble = document.createElement("div");
    bubble.className = "bg-white-1 text-black-1 mb-1 hidden max-w-48 rounded-md px-2 py-1 text-xs";
    const label = document.createElement("span");
    label.className = "mb-0.5 whitespace-nowrap text-[11px] font-bold drop-shadow";
    label.textContent = nick;
    label.style.color = (flair && FLAIR_COLOURS[flair]) || "#edeef0";
    label.dataset.role = "name";
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
      if (settings.current.showSaid) {
        for (const said of summary.said) {
          const npc = all.get(said.nick) ?? spawn(said.nick, "PepoG", said.flair);
          npc.bubble.textContent = said.text;
          npc.bubble.classList.remove("hidden");
          npc.bubbleUntil = now + 5000;
          npc.lastSeen = now;
        }
      }
      if (summary.combo && summary.combo.count >= 3) {
        setCombo(summary.combo);
        // Everyone already on that emote jumps with the combo.
        for (const n of all.values()) if (n.emote === summary.combo.emote) n.hop = 1.4;
      } else setCombo(null);
      // Characters fade out after a minute of silence.
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

  // Clear the stage when switching feeds.
  useEffect(() => {
    for (const n of [...npcs.current.values()]) remove(n);
  }, [feed, remove]);

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
      const y = height * 0.35 + n.depth * height * 0.5 - Math.sin(n.hop * Math.PI) * 26 * n.hop;
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
    setBanner("Winner: Destiny Makes a Joke");
    const until = performance.now() + 4000;
    clapUntil.current = until;
    for (const n of npcs.current.values()) {
      if (!n.clapUntil) n.restore = n.emote;
      setEmote(n, "Klappa");
      n.clapUntil = until;
      n.hop = 1;
    }
    setTimeout(() => setBanner(null), 4000);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          Chat from
          <select
            value={feed}
            onChange={(e) => setFeed(e.currentTarget.value as "sim" | "live")}
            className="rounded border border-white/20 bg-black/40 px-2 py-1"
          >
            <option value="sim">Simulator</option>
            <option value="live">Live destiny.gg chat</option>
          </select>
        </label>
        {feed === "sim" && (
          <>
            <label className="flex items-center gap-2">
              Messages a second
              <input type="range" min={1} max={5000} step={1} value={rate} onChange={(e) => setRate(Number(e.currentTarget.value))} />
              <span className="w-12 tabular-nums">{rate}</span>
            </label>
            <label className="flex items-center gap-2">
              Emote-only
              <input type="range" min={0} max={1} step={0.05} value={emoteShare} onChange={(e) => setEmoteShare(Number(e.currentTarget.value))} />
              <span className="w-10 tabular-nums">{Math.round(emoteShare * 100)}%</span>
            </label>
          </>
        )}
        <label className="flex items-center gap-2">
          Characters at most
          <input type="range" min={10} max={400} step={10} value={max} onChange={(e) => setMax(Number(e.currentTarget.value))} />
          <span className="w-10 tabular-nums">{max}</span>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={names} onChange={(e) => setNames(e.currentTarget.checked)} /> Names
        </label>
        <label className="flex items-center gap-1.5" title="Messages from verified chatters (the Verified flair, mods and so on)">
          <input type="checkbox" checked={showSaid} onChange={(e) => setShowSaid(e.currentTarget.checked)} /> Verified messages
        </label>
        <button type="button" onClick={winnerMoment} className="bg-orange-1 text-black-1 rounded px-3 py-1 font-bold">
          Winner moment
        </button>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-white/10 bg-gradient-to-b from-[#16264d] to-[#0a1430]">
        <div className="absolute inset-x-0 top-[8%] text-center">
          <div className="inline-block -rotate-2 rounded-md border-2 border-orange-1/60 bg-black/40 px-6 py-3 text-2xl font-bold sm:text-4xl">
            {banner ?? "Omegalul of the Year"}
          </div>
          {combo && (
            <div key={combo.count} className="lab-combo mt-3 text-xl font-black italic text-orange-1">
              <span className={`emote ${combo.emote}`} /> ×{combo.count} C-C-C-COMBO
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/40 to-transparent" />
        <div ref={floor} className="absolute inset-0" />
        <div className="absolute top-2 left-2 rounded bg-black/50 px-2 py-1 font-mono text-[11px] leading-tight">
          <div>{status.note || "…"}</div>
          <div>
            {stats.fps} fps · {stats.npcs} characters · {stats.perSecond} msg/s · {stats.emoteOnly} emote-only/s
            {feed === "sim" && ` · aggregator ${stats.ingestMs.toFixed(1)} ms per ¼ s`}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PlayIcon } from "@radix-ui/react-icons";
import { type Clip, nomineeClip } from "@/lab/ClipPlayer";
import { Emote } from "@/lab/Emote";
import { type Award, amountLabel, decidedByRunoff, shareOf } from "@/lab/Results";

export type Nominee = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  emote: string | null;
  clip: Clip | null;
};
/** One award on the big screen: its results joined to its nominees' pictures and clips. */
export type ShowAward = Award & { description: string; nominees: Nominee[] };

/**
 * The results joined to the nominees, in the awards' order. The nominees come
 * from the admin list, so pictures and clips show while the site is locked.
 */
export async function loadShow(results: Award[]): Promise<ShowAward[]> {
  const data = await fetch("/api/admin/nominees").then((r) => (r.ok ? r.json() : []));
  const categories: any[] = Array.isArray(data) ? data : [];
  return results.map((award) => {
    const category = categories.find((c) => c.id === award.id);
    const nominees: Nominee[] = (category?.options ?? []).map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description ?? "",
      image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
      // In the emote award the nominee is the emote, named by its title.
      emote: o.emote ?? (isEmoteAward(award) ? o.title : null),
      clip: nomineeClip(o, `${o.title} · ${award.title}`),
    }));
    return { ...award, description: category?.description ?? "", nominees };
  });
}

/** New Emote of the Year: each nominee is an emote, named by its title. */
const isEmoteAward = (award: { id: string }) => award.id === "emote";

/** The nominee's picture, or its emote while there's none. */
function Picture({ nominee, size }: { nominee: Nominee; size: number }) {
  if (nominee.image) return <img src={nominee.image} alt="" className="h-full w-full object-cover" />;
  if (!nominee.emote) return null;
  return (
    <span className="flex h-full w-full items-center justify-center" style={{ background: "var(--cream)" }}>
      <Emote name={nominee.emote} size={size} />
    </span>
  );
}

/** Scene one: the award's name, big, while the chatters roam. */
export function TitleCard({ award, index, count }: { award: ShowAward; index: number; count: number }) {
  return (
    <div className="cozy-panel mx-auto max-w-3xl px-10 py-8 text-center">
      <span className="cozy-chip coral">
        Award {index + 1} of {count}
      </span>
      <h2 className="mt-4 text-5xl font-black sm:text-6xl">{award.title}</h2>
      {award.description && (
        <p className="mt-3 text-lg font-semibold" style={{ color: "var(--muted)" }}>
          {award.description}
        </p>
      )}
    </div>
  );
}

/**
 * Scene two: the nominees. With clips, a DVD menu: one is highlighted (arrow
 * keys or the pointer move it, skipping those with nothing to play) and plays
 * its clip silently in its tile, like a menu's moving thumbnails; clicking
 * it, or Enter, plays the clip properly. Nominees with nothing to play are
 * plain cards, with no play button or pointer; an award with no clips at all
 * is just an introduction: pictures, names and what each one is.
 */
export function DvdMenu({ award, onPlay, keys }: { award: ShowAward; onPlay: (clip: Clip) => void; keys: boolean }) {
  const n = award.nominees.length;
  const playable = award.nominees.map((x) => !!x.clip);
  const anyClips = playable.some(Boolean);
  const [selected, setSelected] = useState(() => Math.max(0, playable.indexOf(true)));
  // Many nominees (the chatters) are a list of names; more than eight, small cards in two rows or so.
  const layout = n > 24 ? "list" : n > 8 ? "small" : "cards";
  const columns = n <= 4 ? n : n <= 6 ? 3 : 4;
  // Lists and small cards fill the width with as many columns as fit (the
  // arrow keys then go up and down by a guess at six).
  const grid = layout === "cards" ? `repeat(${columns}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${layout === "list" ? 9 : 8.5}rem, 1fr))`;
  const step = layout === "cards" ? columns : 6;
  useEffect(() => {
    if (!keys || !anyClips) return;
    const press = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: step, ArrowUp: -step }[e.key];
      if (move) {
        e.preventDefault();
        setSelected((s) => {
          // The next one along with something to play; else stay put.
          for (let i = s + move; i >= 0 && i < n; i += move) if (playable[i]) return i;
          if (Math.abs(move) !== 1) for (let i = s + Math.sign(move); i >= 0 && i < n; i += Math.sign(move)) if (playable[i]) return i;
          return s;
        });
      } else if (e.key === "Enter") {
        const clip = award.nominees[selected]?.clip;
        if (clip) {
          e.preventDefault();
          onPlay(clip);
        }
      }
    };
    addEventListener("keydown", press);
    return () => removeEventListener("keydown", press);
  }, [keys, n, step, selected, award, onPlay, anyClips]);

  return (
    <div className="cozy-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <h3 className="text-2xl font-black">
          The nominees
          {layout === "list" && (
            <span className="ml-2 text-lg font-bold" style={{ color: "var(--muted)" }}>
              ({n})
            </span>
          )}
        </h3>
        {anyClips && (
          <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            Arrow keys to choose · Enter to play
          </span>
        )}
      </div>
      {layout === "list" ? (
        <ul className="grid gap-x-4 gap-y-1 text-sm" style={{ gridTemplateColumns: grid }}>
          {award.nominees.map((nominee) => (
            <li key={nominee.id} className="flex min-w-0 items-center gap-2 font-extrabold leading-tight">
              <span className="flex h-7 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md">
                {nominee.image ? <img src={nominee.image} alt="" className="h-full w-full object-cover" /> : nominee.emote && <Emote name={nominee.emote} size={0.55} title="" />}
              </span>
              <span className="truncate">{nominee.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`grid ${layout === "small" ? "gap-3" : "gap-4"}`} style={{ gridTemplateColumns: grid }}>
          {award.nominees.map((nominee, i) => (
            <Tile
              key={nominee.id}
              award={award}
              nominee={nominee}
              on={anyClips && i === selected}
              small={layout === "small"}
              onSelect={() => setSelected(i)}
              onPlay={onPlay}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One nominee in the menu: a button that plays its clip, or a plain card when there's none. */
function Tile({
  award,
  nominee,
  on,
  small,
  onSelect,
  onPlay,
}: {
  award: ShowAward;
  nominee: Nominee;
  on: boolean;
  small: boolean;
  onSelect: () => void;
  onPlay: (clip: Clip) => void;
}) {
  const clip = nominee.clip;
  const picture = (
    <div className="relative aspect-video overflow-hidden rounded-[13px]" style={{ background: clip ? "black" : "var(--cream)" }}>
      {on && clip?.clipUrl ? (
        <video
          className="h-full w-full object-cover"
          src={clip.clipUrl}
          // A moving thumbnail, like a DVD menu; embeds show their picture.
          poster={nominee.image ?? undefined}
          muted
          autoPlay
          loop
          playsInline
        />
      ) : (
        <Picture nominee={nominee} size={small ? 1.4 : 2.4} />
      )}
      {clip && (
        <span
          className={`absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full ${on ? "" : "opacity-70"}`}
          style={{ background: "var(--coral)", color: "white" }}
        >
          <PlayIcon />
        </span>
      )}
    </div>
  );
  const caption = (
    <div className="space-y-0.5 px-1 pt-1.5">
      <div className="flex items-center gap-1.5 font-extrabold leading-tight">
        {on && (
          <span className="lab-pointer" style={{ color: "var(--coral)" }}>
            ▶
          </span>
        )}
        {/* The emote itself beside its name, moving, when the picture is a still. */}
        {isEmoteAward(award) && nominee.image && <Emote name={nominee.title} size={0.6} title="" />}
        <span className="truncate">{nominee.title}</span>
      </div>
      {isEmoteAward(award) && !small && !nominee.description && (
        <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>
          A destiny.gg emote
        </div>
      )}
      {nominee.description && (
        <p className={`font-semibold leading-snug ${small ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm"}`} style={{ color: "var(--muted)" }}>
          {nominee.description}
        </p>
      )}
    </div>
  );
  if (!clip) {
    return (
      <div className="rounded-[18px] border-2 p-1.5" style={{ background: "var(--cream)", borderColor: "var(--panel-border)" }}>
        {picture}
        {caption}
      </div>
    );
  }
  return (
    <button
      type="button"
      onPointerEnter={onSelect}
      onFocus={onSelect}
      onClick={() => onPlay(clip)}
      className="block rounded-[18px] border-2 p-1.5 text-left transition-[border-color,box-shadow] duration-150"
      style={{
        background: "var(--cream)",
        borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
        boxShadow: `0 4px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
        cursor: "pointer",
      }}
    >
      {picture}
      {caption}
    </button>
  );
}

/** Scene four: the winner, with their clip to play again. */
export function WinnerCard({ award, onPlay, onCheer }: { award: ShowAward; onPlay: (clip: Clip) => void; onCheer: () => void }) {
  const result = award.results.find((r) => r.isWinner) ?? [...award.results].sort((a, b) => b.count - a.count)[0];
  const nominee = award.nominees.find((x) => x.id === result?.id);
  if (!result) return <div className="cozy-panel p-8">No votes in this award.</div>;
  return (
    <div className="cozy-panel space-y-4 p-6 text-center">
      <div className="flex items-center justify-center gap-3">
        <Emote name="CHEERSTINY" size={1.3} title="" />
        <span className="cozy-chip coral">Winner</span>
        <Emote name="Klappa" size={1.3} title="" />
      </div>
      {(nominee?.image || nominee?.emote) && (
        <div className="mx-auto aspect-video max-w-md overflow-hidden rounded-[16px] border-2" style={{ borderColor: "var(--panel-border)" }}>
          <Picture nominee={nominee} size={4} />
        </div>
      )}
      <h2 className="flex items-center justify-center gap-3 text-4xl font-black">
        {isEmoteAward(award) && nominee?.image && <Emote name={result.title} size={1.2} title="" />}
        {result.title}
      </h2>
      {nominee?.description && (
        <p className="font-semibold" style={{ color: "var(--muted)" }}>
          {nominee.description}
        </p>
      )}
      <p className="hand text-2xl font-bold" style={{ color: "var(--muted)" }}>
        {winnerLine(award, result.id, result.count, result.percentage)}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {nominee?.clip && (
          <button type="button" className="cozy-btn primary" onClick={() => onPlay(nominee.clip!)}>
            <PlayIcon /> Play it again
          </button>
        )}
        <button type="button" className="cozy-btn" onClick={onCheer}>
          <Emote name="Klappa" size={0.6} title="" /> Cheer again
        </button>
      </div>
    </div>
  );
}

/** The winner's numbers, said in words: votes and share, or how the runoff went. */
function winnerLine(award: ShowAward, id: string, count: number, percentage: number) {
  const votes = (n: number) => `${n.toLocaleString()} ${n === 1 ? "vote" : "votes"}`;
  if (award.unit === "points") return `${amountLabel(award, count)} from ${award.total.toLocaleString()} ballots`;
  if (decidedByRunoff(award)) {
    const rounds = award.rounds!;
    const last = rounds[rounds.length - 1]!;
    const counted = Object.values(last.counts).reduce((a, b) => a + b, 0);
    const mine = last.counts[id] ?? 0;
    return `Won in round ${rounds.length} of the runoff: ${votes(mine)}, ${counted ? ((mine / counted) * 100).toFixed(1) : 0}% of ballots still in`;
  }
  return `${votes(count)} · ${percentage}% ${shareOf(award)}`;
}

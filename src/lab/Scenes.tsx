import { useEffect, useState } from "react";
import { PlayIcon } from "@radix-ui/react-icons";
import { type Clip, nomineeClip } from "@/lab/ClipPlayer";
import { Emote } from "@/lab/Emote";
import type { Award } from "@/lab/Results";

export type Nominee = { id: string; title: string; image: string | null; emote: string | null; clip: Clip | null };
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
      image: o.thumbnailUrl ?? (o.imageId ? `/Media/${o.imageId}` : null),
      emote: o.emote ?? null,
      clip: nomineeClip(o, `${o.title} · ${award.title}`),
    }));
    return { ...award, description: category?.description ?? "", nominees };
  });
}

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
 * Scene two: the nominees as a DVD menu. One is highlighted (arrow keys or
 * the pointer move it) and plays its clip silently in its tile, like a menu's
 * moving thumbnails; clicking it, or Enter, plays the clip properly.
 */
export function DvdMenu({ award, onPlay, keys }: { award: ShowAward; onPlay: (clip: Clip) => void; keys: boolean }) {
  const [selected, setSelected] = useState(0);
  const n = award.nominees.length;
  const columns = n <= 4 ? n : n <= 6 ? 3 : 4;
  useEffect(() => {
    if (!keys) return;
    const press = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key];
      if (move) {
        e.preventDefault();
        setSelected((s) => Math.min(n - 1, Math.max(0, s + move)));
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
  }, [keys, n, columns, selected, award, onPlay]);

  return (
    <div className="cozy-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <h3 className="text-2xl font-black">The nominees</h3>
        <span className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          Arrow keys to choose · Enter to play
        </span>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {award.nominees.map((nominee, i) => {
          const on = i === selected;
          return (
            <button
              key={nominee.id}
              type="button"
              onPointerEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => nominee.clip && onPlay(nominee.clip)}
              className="block rounded-[18px] border-2 p-1.5 text-left transition-[border-color,box-shadow] duration-150"
              style={{
                background: "var(--cream)",
                borderColor: on ? "var(--primary-shadow)" : "var(--panel-border)",
                boxShadow: `0 4px 0 ${on ? "var(--primary-shadow)" : "var(--cream-shadow)"}`,
                cursor: nominee.clip ? "pointer" : "default",
              }}
            >
              <div className="relative aspect-video overflow-hidden rounded-[13px] bg-black">
                {on && nominee.clip?.clipUrl ? (
                  <video
                    className="h-full w-full object-cover"
                    src={nominee.clip.clipUrl}
                    // A moving thumbnail, like a DVD menu; embeds show their picture.
                    poster={nominee.image ?? undefined}
                    muted
                    autoPlay
                    loop
                    playsInline
                  />
                ) : (
                  <Picture nominee={nominee} size={2.4} />
                )}
                {nominee.clip && (
                  <span
                    className={`absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full ${on ? "" : "opacity-70"}`}
                    style={{ background: "var(--coral)", color: "white" }}
                  >
                    <PlayIcon />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 px-1 pt-1.5 font-extrabold leading-tight">
                {on && <span className="lab-pointer" style={{ color: "var(--coral)" }}>▶</span>}
                <span className="truncate">{nominee.title}</span>
                {!nominee.clip && (
                  <span className="ml-auto shrink-0 text-xs font-bold" style={{ color: "var(--muted)" }}>
                    no clip
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
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
      <h2 className="text-4xl font-black">{result.title}</h2>
      <p className="hand text-2xl font-bold" style={{ color: "var(--muted)" }}>
        {result.count.toLocaleString()} votes · {result.percentage}%
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

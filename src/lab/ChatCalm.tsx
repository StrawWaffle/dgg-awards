import { type ReactNode, useEffect, useRef, useState } from "react";
import { originOf, useBursts } from "@/lab/Bursts";
import { Emote } from "@/lab/Emote";
import { Sketch } from "@/lab/sketch";
import { Bars, type Card, Cards, Chips, Crown, type Review, day, fmt, monthName } from "@/site/ChatReviewPage";

/** The year in chat for admins (the lab), before the results are out. */
export function useChatReview() {
  const [data, setData] = useState<Review | null | "missing">(null);
  useEffect(() => {
    fetch("/api/chat-review?preview=1")
      .then((r) => (r.ok ? r.json() : "missing"))
      .then(setData)
      .catch(() => setData("missing"));
  }, []);
  return data;
}

type Burst = (emote: string) => (e: React.MouseEvent) => void;

/**
 * Experiment: the year in chat, calmer (rinlux: "a bit busy … negative space
 * to help highlight things"). Each section leads with one highlight, big, with
 * room around it, then two smaller facts without boxes. Everything else (the
 * other cards, the bars, the tables) is folded under "See all the numbers".
 */
export function ChatCalm() {
  const data = useChatReview();
  const box = useRef<HTMLDivElement>(null);
  const [layer, fire] = useBursts();
  const burst: Burst = (emote) => (e) => fire(emote, ...originOf(e, box.current), 7);
  if (data === null) return <div className="cozy-panel p-8">Loading…</div>;
  if (data === "missing") return <div className="cozy-panel p-8">Couldn't load the year in chat.</div>;

  const n = (label: string) => data.numbers.find((x) => x.label === label)!;
  const headline = ["messages", "chatters", "emotes"].map(n);
  const quiet = data.numbers.filter((x) => !["messages", "chatters", "emotes"].includes(x.label));
  const quote = (who: string) => data.greentext.quotes.find((q) => q.who === who)!;
  const balanced = data.tags.duos.find((d) => d.a === "aus_bits") ?? data.tags.duos[0]!;
  const lonely = data.tags.unrequited.find((u) => u.a === "Eban") ?? data.tags.unrequited[0]!;

  return (
    <div ref={box} className="relative mx-auto max-w-4xl">
      {layer}
      <Sketch pad={5} radius={26} strokeWidth={3} boil roughness={1.5}>
        <header className="rounded-[24px] px-6 py-14 text-center sm:px-12" style={{ background: "var(--panel)" }}>
          <h1 className="text-5xl font-black sm:text-6xl">{data.year} in DGG chat</h1>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--muted)" }}>
            {day(data.from)} to {day(data.through, true)}
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {headline.map((h) => (
              <div key={h.label}>
                <div className="hand text-4xl font-bold tabular-nums sm:text-5xl">{fmt(h.value)}</div>
                <div className="mt-1 font-black">{h.label}</div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-sm font-semibold" style={{ color: "var(--muted)" }}>
            {quiet.map((q) => `${fmt(q.value)} ${q.label}`).join(" · ")}
          </p>
        </header>
      </Sketch>

      <Part title="Emotes" emote="OMEGALUL" burst={burst} hero={data.emotes.cards[0]!} facts={data.emotes.cards.slice(1, 3).map(fact)}>
        <Cards cards={data.emotes.cards.slice(3)} onEmote={burst} />
        <div className="grid gap-8 lg:grid-cols-2">
          <Bars title="Most used, all chat" bars={data.emotes.top.slice(0, 5)} />
          <Bars title="Most emotes, per person" bars={data.emotes.users.slice(0, 5)} />
        </div>
      </Part>

      <Part
        title="Combos"
        emote="DANKMEMES"
        burst={burst}
        hero={data.combos.cards[2]!}
        facts={[data.combos.cards[0]!, data.combos.cards[1]!].map(fact)}
      >
        <Cards cards={data.combos.cards.slice(3)} onEmote={burst} />
        <ol className="space-y-1">
          {data.combos.top.slice(0, 5).map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 text-sm font-semibold">
              <Emote name={c.emote} size={0.5} title={c.emote} />
              <span className="hand text-xl font-bold">{c.size}×</span>
              {c.emote}, {day(c.date)}. Broken by <b>{c.brokenBy}</b>
              {c.breaking ? <> with “{c.breaking}”</> : null}.
            </li>
          ))}
        </ol>
        <div className="grid gap-8 lg:grid-cols-2">
          <Bars title="Joined the most combos" bars={data.combos.joiners.slice(0, 5)} />
          <Bars title="Broke the most combos" bars={data.combos.breakers.slice(0, 5)} />
        </div>
      </Part>

      <Part title="Saying their names" emote="Stare" burst={burst} hero={data.names.cards[0]!} facts={data.names.cards.slice(1, 3).map(fact)}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-left">
                <th />
                {data.names.crowns.map((r) => (
                  <th key={r.target} className="px-2 font-black">
                    {r.target}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="px-2 text-left font-black">The year</th>
                {data.names.crowns.map((r) => (
                  <Crown key={r.target} cell={r.year} year />
                ))}
              </tr>
              {data.names.months.map((m, i) => (
                <tr key={m}>
                  <th className="px-2 text-left font-bold" style={{ color: "var(--muted)" }}>
                    {monthName(m)}
                  </th>
                  {data.names.crowns.map((r) => (
                    <Crown key={r.target} cell={r.months[i] ?? null} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Part>

      <Part
        title="Who tagged whom"
        emote="DinkDonk"
        burst={burst}
        hero={data.tags.cards[0]!}
        facts={[
          { big: `${fmt(balanced.ab)} ⇄ ${fmt(balanced.ba)}`, title: `${balanced.a} and ${balanced.b}`, text: balanced.note ?? "" },
          { big: `${fmt(lonely.ab)} → ${fmt(lonely.ba)}`, title: `${lonely.a}, unrequited`, text: `Tagged ${lonely.b} ${fmt(lonely.ab)} times and got ${fmt(lonely.ba)} back.` },
        ]}
      >
        <ul className="space-y-1 text-sm font-semibold">
          {data.tags.duos.map((d) => (
            <li key={d.a + d.b}>
              <b>{d.a}</b> → <b>{d.b}</b> <span className="hand text-lg">{fmt(d.ab)}</span>, back <span className="hand text-lg">{fmt(d.ba)}</span>
            </li>
          ))}
          {data.tags.unrequited.map((u) => (
            <li key={u.a + u.b}>
              <b>{u.a}</b> → <b>{u.b}</b> <span className="hand text-lg">{fmt(u.ab)}</span>, back <span className="hand text-lg">{fmt(u.ba)}</span>
            </li>
          ))}
        </ul>
        <Bars title="Most tagged" bars={data.tags.tagged.slice(0, 5)} />
      </Part>

      <Part
        title="Greentext"
        emote="PepoG"
        burst={burst}
        hero={data.greentext.cards[0]!}
        facts={[quote("yusuf"), quote("Clanker")].map((q) => ({ greentext: q.text, title: q.who, text: q.note }))}
      >
        <div className="space-y-4">
          {data.greentext.quotes
            .filter((q) => q.who !== "yusuf" && q.who !== "Clanker")
            .map((q) => (
              <figure key={q.who}>
                <blockquote className="chat-greentext font-semibold">{q.text}</blockquote>
                <figcaption className="text-sm font-bold">
                  {q.who} <span style={{ color: "var(--muted)" }}>· {q.note}</span>
                </figcaption>
              </figure>
            ))}
        </div>
        <Bars title="Most greentext" bars={data.greentext.top.slice(0, 5)} />
      </Part>

      <Part title="Links" emote="CINEMA" burst={burst} hero={data.links.cards[0]!} facts={data.links.cards.slice(1, 3).map(fact)}>
        <ul className="space-y-3">
          {data.links.top.map((l) => (
            <li key={l.rank} className="text-sm font-semibold">
              <span className="hand text-lg font-bold">{fmt(l.reactions)} reactions</span> · <b>{l.who}</b>, {day(l.date)}: {l.text}
              <div style={{ color: "var(--muted)" }}>
                {l.note}{" "}
                {l.link && (
                  <a className="underline" href={l.link.url} target="_blank" rel="noopener noreferrer">
                    {l.link.label} ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Part>

      <Part title="Law and order" emote="GIGACHAD" burst={burst} hero={data.law.cards[0]!} facts={data.law.cards.slice(1, 3).map(fact)}>
        <Cards cards={[...data.law.cards.slice(3), ...data.law.flyers]} onEmote={burst} />
        <Bars title="Mod commands, per mod" bars={data.law.mods.slice(0, 5)} />
        <div className="grid gap-8 lg:grid-cols-3">
          <Chips title="Ban reasons we can print" chips={data.law.banReasons} />
          <Chips title="Words nuked most" chips={data.law.nuked} />
          <Chips title="Link rules broken" chips={data.law.linkRules} />
        </div>
      </Part>

      <p className="mx-auto max-w-2xl pt-8 pb-4 text-center text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Names that are also everyday words weren't counted as tags: {data.notTags.join(", ")}.
      </p>
    </div>
  );
}

type Fact = { big?: string; greentext?: string; title: string; text: string };
const fact = (c: Card): Fact => ({ big: c.big, title: c.title, text: c.text });

/** One section: its title, one highlight with room around it, two smaller facts, and the rest folded away. */
function Part({ title, emote, burst, hero, facts, children }: { title: string; emote: string; burst: Burst; hero: Card; facts: Fact[]; children: ReactNode }) {
  return (
    <section className="pt-24">
      <h2 className="flex items-center justify-center gap-2 text-sm font-black tracking-wide" style={{ color: "var(--muted)" }}>
        <Emote name={emote} size={0.5} title="" />
        {title}
      </h2>
      <div className="mx-auto mt-8 max-w-xl text-center">
        <button type="button" className="cozy-row rounded-2xl p-2" onClick={burst(hero.emote)} aria-label={`A burst of ${hero.emote}`}>
          <Emote name={hero.emote} size={2} title="" />
        </button>
        <div className="hand mt-2 text-7xl font-bold tabular-nums sm:text-8xl">{hero.big}</div>
        <h3 className="mt-3 text-2xl font-black">{hero.title}</h3>
        <p className="mt-2 text-lg font-semibold" style={{ color: "var(--muted)" }}>
          {hero.text}
        </p>
      </div>
      <div className="mx-auto mt-14 grid max-w-3xl gap-10 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.title}>
            {f.big && <div className="hand text-3xl font-bold tabular-nums">{f.big}</div>}
            {f.greentext && <blockquote className="chat-greentext font-semibold">{f.greentext}</blockquote>}
            <h4 className="mt-1 font-black">{f.title}</h4>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--muted)" }}>
              {f.text}
            </p>
          </div>
        ))}
      </div>
      <details className="group mx-auto mt-12 max-w-3xl text-center">
        <summary className="cozy-btn cursor-pointer list-none text-sm">
          <span className="group-open:hidden">See all the numbers</span>
          <span className="hidden group-open:inline">Hide the numbers</span>
        </summary>
        <div className="cozy-panel mt-6 space-y-8 p-6 text-left">{children}</div>
      </details>
    </section>
  );
}

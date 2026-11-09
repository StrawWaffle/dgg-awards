import { type ReactNode, useEffect, useState } from "react";
import { Emote } from "@/lab/Emote";
import { MusicBar } from "@/lab/MusicBar";
import { useSourceChoice, useStartOnFirstGesture } from "@/lab/music";
import { Stage } from "@/lab/Stage";
import { Visualizer } from "@/lab/Visualizer";
import { VoteDemo } from "@/lab/VoteDemo";

/**
 * The lab: ideas for a more fun front page and presentation, tried out here
 * before they go anywhere real. Admins only for now.
 */
export function Lab() {
  const [me, setMe] = useState<{ admin: boolean; name: string } | null | undefined>(undefined);
  const [emotes, setEmotes] = useState<string[]>([]);
  const [source, setSource] = useSourceChoice();
  useStartOnFirstGesture();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);
  useEffect(() => {
    if (!me?.admin) return;
    fetch("/api/lab/emotes")
      .then((r) => r.json())
      .then(setEmotes)
      .catch(() => setEmotes([]));
  }, [me]);

  if (me === undefined) return <p className="p-6">Loading…</p>;
  if (!me?.admin) {
    return (
      <main className="mx-auto max-w-xl space-y-3 p-6 text-center">
        <Emote name="PepoG" size={2} />
        <p>The lab is for admins while we try things out.</p>
        <a className="text-orange-1 underline" href="/signin">
          Sign in
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <header className="bg-blue-2 sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <h1 className="flex items-center gap-3 text-2xl font-black">
          <Emote name="PepoG" size={1.2} title="" /> The lab
        </h1>
        <MusicBar />
      </header>
      <p className="text-white-1/70 max-w-3xl text-sm">
        Ideas for a more playful site and stream, to try before they go anywhere real: music that the page moves to,
        emotes reacting to what you do, and chat walking around the stage during the presentation. Nothing here
        affects the real site.
      </p>

      <Part title="Music" note="Starts on your first click at a low volume. The volume and mute are remembered.">
        <Visualizer source={source} setSource={setSource} />
      </Part>

      <Part title="Emote reactions" note="Vote, skip, answer the question and finish to see each reaction.">
        <VoteDemo />
      </Part>

      <Part
        title="Presentation stage"
        note="Chatters as their emotes. The simulator floods the same code the server uses; push it up to see how it holds."
      >
        <Stage source={source} emotes={emotes} />
      </Part>
    </main>
  );
}

function Part({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-white-1/60 text-sm">{note}</p>
      </div>
      {children}
    </section>
  );
}

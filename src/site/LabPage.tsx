import { useEffect, useState } from "react";
import { Emote } from "@/lab/Emote";
import { useSourceChoice, useStartOnFirstGesture } from "@/lab/music";
import { Stage } from "@/lab/Stage";
import { Visualizer } from "@/lab/Visualizer";

/**
 * The lab's experiments. What's agreed (the voting page, the results) lives in
 * the site itself; the lab is where things are tried a bit differently first.
 */
export const labViews = [
  { id: "stage", label: "Big screen" },
  { id: "sound", label: "Sound check" },
] as const;
export type LabView = (typeof labViews)[number]["id"];

/** The lab page: admins only (its APIs refuse everyone else too). */
export function LabPage({ admin, view, chatOpen }: { admin: boolean; view: LabView; chatOpen: boolean }) {
  if (!admin) {
    return (
      <main className="mx-auto mt-16 max-w-md px-4">
        <div className="cozy-panel space-y-4 p-8 text-center">
          <Emote name="PepoG" size={2} />
          <p className="font-bold">The lab is for admins, for trying things out.</p>
          <a className="cozy-btn primary" href="/signin?next=/lab">
            Sign in
          </a>
        </div>
      </main>
    );
  }
  return <Experiments view={view} chatOpen={chatOpen} />;
}

function Experiments({ view, chatOpen }: { view: LabView; chatOpen: boolean }) {
  const [emotes, setEmotes] = useState<string[]>([]);
  const [source, setSource] = useSourceChoice();
  // In the lab the music starts on the first click anywhere (not on the
  // public pages, where only the music button starts it).
  useStartOnFirstGesture();
  useEffect(() => {
    fetch("/api/lab/emotes")
      .then((r) => r.json())
      .then(setEmotes)
      .catch(() => setEmotes([]));
  }, []);
  if (view === "stage") return <Stage source={source} emotes={emotes} chatOpen={chatOpen} />;
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <Visualizer source={source} setSource={setSource} />
    </main>
  );
}

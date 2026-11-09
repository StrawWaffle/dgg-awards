import { useEffect, useRef } from "react";
import { type LinkType, classifyLink, linkAt, linkLabel } from "@/lib/links";
import { music } from "@/lab/music";
import { Sketch } from "@/lab/sketch";

export type Clip = {
  title: string;
  clipUrl: string;
  thumbnailUrl: string | null;
  url: string | null;
  linkType: LinkType | null;
  clipStart: number | null;
};

/**
 * A nominee's clip in a hand-drawn frame: plays once and stops on its last
 * frame (no loop, as the 2025 stream wanted), with the full source linked at
 * the moment it starts. The music ducks while it plays.
 */
export function ClipPlayer({ clip, autoPlay = true, onEnded }: { clip: Clip; autoPlay?: boolean; onEnded?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => music.setDucked(false), []);
  const type = clip.linkType ?? (clip.url ? classifyLink(clip.url)?.type : null) ?? null;

  return (
    <div className="space-y-2">
      <Sketch pad={5} radius={18} strokeWidth={3} boil drawOn>
        <video
          ref={video}
          className="block aspect-video w-full rounded-[16px] bg-black"
          src={clip.clipUrl}
          poster={clip.thumbnailUrl ?? undefined}
          controls
          autoPlay={autoPlay}
          playsInline
          onPlay={() => music.setDucked(true)}
          onPause={() => music.setDucked(false)}
          onEnded={() => {
            music.setDucked(false);
            onEnded?.();
          }}
        />
      </Sketch>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm font-bold">
        <span>{clip.title}</span>
        {clip.url && type && (
          <a className="underline" href={linkAt(clip.url, clip.clipStart ?? 0)} target="_blank" rel="noopener noreferrer">
            ↗ Full context: {linkLabel(type, clip.clipStart ?? undefined)}
          </a>
        )}
      </div>
    </div>
  );
}

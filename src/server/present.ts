// Shapes nominee data for clients: storage keys become URLs.
import type { ClipStatus } from "@/lib/data/schema";
import { storage } from "@/server/storage";

type WithMedia = {
  clipKey: string | null;
  clipStatus: ClipStatus | null;
  thumbnailKey: string | null;
};

/** `clipUrl` once the clip is ready; `thumbnailUrl` whenever there is one. */
export function withMediaUrls<T extends WithMedia>(nominee: T) {
  return {
    ...nominee,
    clipUrl: nominee.clipKey && nominee.clipStatus === "ready" ? storage.url(nominee.clipKey) : null,
    thumbnailUrl: nominee.thumbnailKey ? storage.url(nominee.thumbnailKey) : null,
  };
}

export function categoriesWithMediaUrls<C extends { options: WithMedia[] }>(categories: C[]) {
  return categories.map((c) => ({ ...c, options: c.options.map(withMediaUrls) }));
}

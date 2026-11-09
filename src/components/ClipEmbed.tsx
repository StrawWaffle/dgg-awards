import { CrossCircledIcon } from "@radix-ui/react-icons";
import { AspectRatio, Dialog } from "radix-ui";
import { type LinkType, classifyLink, linkAt, linkLabel } from "@/lib/links";

type Props = {
  title: string;
  clipUrl: string;
  thumbnailUrl: string | null;
  /** The source the clip was cut from. */
  sourceUrl: string | null;
  linkType: LinkType | null;
  clipStart: number | null;
};

/**
 * A clip we host. Same pattern as the YouTube embed (thumbnail, ▶ opens a
 * player), but it plays our own trimmed file: it stops at the end instead of
 * looping, and the source link opens the full video at the clip's start.
 */
export function ClipEmbed({ title, clipUrl, thumbnailUrl, sourceUrl, linkType, clipStart }: Props) {
  const type = linkType ?? (sourceUrl ? classifyLink(sourceUrl).type : null);

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <AspectRatio.Root
          ratio={16 / 9}
          className="before:text-orange-1 relative cursor-pointer transition-all before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:z-10 before:-translate-x-1/2 before:-translate-y-1/2 before:touch-none before:text-2xl before:opacity-0 before:content-['▶'] hover:before:opacity-100"
          aria-label={`Play clip: ${title}`}
        >
          {thumbnailUrl ? (
            <img
              className="size-full rounded object-cover transition-all lg:blur-xs lg:hover:blur-none"
              src={thumbnailUrl}
              alt={`Thumbnail for the clip "${title}"`}
              loading="lazy"
            />
          ) : (
            <div className="size-full rounded bg-neutral-800" />
          )}
        </AspectRatio.Root>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/80 backdrop-blur-sm transition-all" />
        <Dialog.Content className="border-white-1 fixed top-1/2 left-1/2 z-50 w-11/12 -translate-x-1/2 -translate-y-1/2 space-y-2 rounded-md border bg-neutral-900 p-2 lg:w-2/3">
          <div className="flex items-center">
            <Dialog.Title className="text-white-1 grow leading-4 font-bold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <CrossCircledIcon className="cursor-pointer text-red-900" aria-label="Close" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Clip player</Dialog.Description>
          {/* No loop: a clip should end on its ending, not restart. */}
          <video
            className="aspect-video w-full rounded bg-black"
            src={clipUrl}
            poster={thumbnailUrl ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
          {sourceUrl && type && (
            <a
              className="text-blue-1 inline-block text-sm hover:underline"
              href={linkAt(sourceUrl, clipStart)}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ Full context: {linkLabel(type, clipStart)}
            </a>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

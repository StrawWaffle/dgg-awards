import coggers from "@/media/coggers.png" with { type: "image/png" };
import waiting from "@/media/waiting.png" with { type: "image/png" };
import { CrossCircledIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { AspectRatio, Dialog } from "radix-ui";
import { PossibleLink } from "@/components/util";
import { fetchYouTubeEmbedData } from "@/lib/queries";

type Props = {
  videoId: string;
  externalUrl: string | null;
};

export function YouTubeEmbed({ videoId, externalUrl }: Props) {
  const query = useQuery({
    queryKey: ["yt", videoId],
    queryFn: ({ queryKey }) => fetchYouTubeEmbedData(queryKey[1]),
  });

  if (query.status === "pending") {
    return (
      <AspectRatio.Root ratio={16 / 9}>
        <div className="flex size-full items-center justify-center bg-neutral-800">
          <img src={coggers} className="m-auto h-8 w-8 animate-spin" />
        </div>
      </AspectRatio.Root>
    );
  }

  if (!query.data || query.status === "error") {
    return (
      <AspectRatio.Root ratio={16 / 9}>
        <div className="flex size-full items-center justify-center bg-neutral-800">
          <img src={waiting} className="m-auto h-8 w-8" />
        </div>
      </AspectRatio.Root>
    );
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <AspectRatio.Root
          ratio={16 / 9}
          className="before:text-orange-1 relative cursor-pointer transition-all before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:z-10 before:-translate-x-1/2 before:-translate-y-1/2 before:touch-none before:text-2xl before:opacity-0 before:content-['▶'] hover:before:opacity-100"
        >
          <img
            className="size-full rounded object-cover transition-all lg:blur-xs lg:hover:blur-none"
            src={query.data.thumbnail_url}
            alt={`Thumbnail for video titled '${query.data.title}'`}
          />
        </AspectRatio.Root>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/80 backdrop-blur-sm transition-all" />
        <Dialog.Content className="border-white-1 fixed top-1/2 left-1/2 z-50 w-11/12 -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-md border bg-neutral-900 p-2 lg:w-2/3">
          <div className="flex items-center">
            <Dialog.Title className="text-white-1 max-h-4 grow leading-4 font-bold">
              <PossibleLink
                activeClassName="text-blue-1 hover:underline after:content-['↗'] after:text-orange-1 after:inline-block after:no-underline"
                href={externalUrl}
              >
                {query.data.title}
              </PossibleLink>
            </Dialog.Title>
            <Dialog.Close asChild>
              <CrossCircledIcon className="cursor-pointer text-red-900" />
            </Dialog.Close>
          </div>
          <AspectRatio.Root ratio={16 / 9}>
            <div
              className="relative h-full w-full [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full! [&>iframe]:w-full!"
              dangerouslySetInnerHTML={{ __html: query.data?.html }}
            />
          </AspectRatio.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

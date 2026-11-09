import { StreamableEmbed } from "@/components/StreamableEmbed";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";

type Props = {
  code: string;
  externalUrl: string | null;
};

export function VideoEmbed({ code, externalUrl }: Props) {
  const isYouTube = code.substring(0, 3) === "yt:";

  if (isYouTube) {
    return (
      <YouTubeEmbed videoId={code.substring(3)} externalUrl={externalUrl} />
    );
  }

  return <StreamableEmbed shortcode={code} externalUrl={externalUrl} />;
}

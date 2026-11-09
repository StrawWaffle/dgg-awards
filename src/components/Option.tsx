import { useState } from "react";
import clsx from "clsx";
import { VideoEmbed } from "@/components/VideoEmbed";
import { VoteButton } from "@/components/VoteButton";
import { PossibleLink } from "@/components/util";
import type { Option } from "@/lib/types";

type Props = Option & {
  maintainAspect: boolean;
  compact: boolean;
  voted: boolean;
  disabled?: boolean;
};

export function Option(props: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hoverHighlightClass =
    "rounded transition hover:shadow-[0_0_0_1px_rgba(0,144,255,0.7),0_0_20px_rgba(0,144,255,0.3)] hover:-translate-y-0.1";
  const descriptionLimit = props.compact ? 120 : 180;
  const description = props.description?.trim() ?? "";
  const hasOverflow = description.length > descriptionLimit;
  const truncatedDescription = hasOverflow
    ? description.slice(0, descriptionLimit).replace(/\s+\S*$/, "")
    : description;
  const visibleDescription =
    hasOverflow && !isExpanded ? truncatedDescription : description;

  return (
    <div
      className={clsx("flex shrink-0 flex-col items-center p-1", {
        "my-1 w-28": props.compact,
        "my-2 w-48": !props.compact,
        "mx-[1ch]": props.maintainAspect,
        "bg-orange-1/50 rounded": props.voted,
        [hoverHighlightClass]: !props.disabled,
      })}
    >
      {props.videoId && (
        <VideoEmbed code={props.videoId} externalUrl={props.url} />
      )}
      {props.imageId && (
        <PossibleLink
          activeClassName="peer hover:brightness-115 transition-all cursor-pointer"
          href={props.url}
        >
          <img
            loading="lazy"
            src={`/Media/${props.imageId}`}
            className={clsx("rounded-md", {
              "h-20 w-20": props.compact,
              "h-32 w-32": !props.compact,
              "max-h-32 w-auto!": props.maintainAspect,
            })}
          />
        </PossibleLink>
      )}
      {!props.videoId && !props.imageId && (
        <img
          loading="lazy"
          src="/Media/waiting.png"
          className={clsx("scale-25 animate-pulse rounded-md", {
            "h-20 w-20": props.compact,
            "h-32 w-32": !props.compact,
            "max-h-32 w-auto!": props.maintainAspect,
          })}
        />
      )}
      <PossibleLink
        activeClassName="hover:underline hover:brightness-115 transition-all [&>p]:after:content-['↗'] [&>p]:after:text-orange-1 [&>p]:after:inline-block [&>p]:after:no-underline peer-hover:underline"
        href={props.url}
      >
        <p
          data-role="title"
          className={clsx("text-center", { "text-orange-1": props.voted })}
        >
          {props.title}
        </p>
      </PossibleLink>
      {description.length > 0 && (
        <p className="self-start p-1 text-xs opacity-70">
          {visibleDescription}
          {hasOverflow && !isExpanded && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="text-orange-1/80 hover:text-orange-1 inline-flex min-h-6 items-center rounded px-1.5 text-sm underline"
                aria-label="Show full description"
              >
                ...
              </button>
            </>
          )}
        </p>
      )}
      <div className="h-2 grow" />
      <VoteButton
        categoryId={props.categoryId}
        disabled={!!props.disabled}
        id={props.id}
        voted={props.voted}
      />
    </div>
  );
}

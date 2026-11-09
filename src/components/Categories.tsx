import { useRef, useState } from "react";
import { featuredVideo } from "@/data";
import { UpdateIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ScrollArea } from "radix-ui";
import { Option } from "@/components/Option";
import { VideoEmbed } from "@/components/VideoEmbed";
import { fetchNominees, fetchUserVotes, getVoteResults } from "@/lib/queries";

export function Categories() {
  const dggBannerSrc =
    "/Media/dgg_chatter_of_the_year_banner_cutechristiangirl.webp";
  const nomineesQuery = useQuery({
    queryKey: ["nominees"],
    queryFn: fetchNominees,
  });

  const userVotesQuery = useQuery({
    queryKey: ["userVotes"],
    queryFn: fetchUserVotes,
    staleTime: 1 * 60 * 1000,
  });

  if (nomineesQuery.data === undefined) {
    return null;
  }

  return (
    <div className="space-y-4 p-2">
      <div className="bg-blue-1/10 relative rounded p-2 lg:mx-auto lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-center">
        <div className="text-center opacity-90 lg:sticky lg:top-2 lg:mx-auto">
          <p className="text-orange-1 text-lg font-bold lg:text-3xl">
            {featuredVideo.title}
          </p>
        </div>
        <div className="ml-2">
          <div className="mx-auto w-full max-w-3xl">
            <VideoEmbed code={featuredVideo.videoId} externalUrl={null} />
          </div>
        </div>
      </div>
      {nomineesQuery.data.map((category, index) => (
        <div
          key={category.id}
          id={category.id}
          className="bg-blue-1/10 relative rounded p-2 lg:mx-auto lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-center"
        >
          <div className="w-full text-center opacity-90 lg:sticky lg:top-2 lg:mx-auto">
            <a
              className="transition-all hover:brightness-105"
              href={`#${category.id}`}
            >
              <p className="text-orange-1 text-lg font-bold transition-transform hover:scale-105 hover:-rotate-2 lg:text-3xl">
                {category.title}
              </p>
            </a>
            <p className="text-blue-1 line-clamp-3 text-center">
              {category.description}
            </p>
            {category.id === "dgger" && (
              <img
                src={dggBannerSrc}
                alt="DGGer of the Year banner"
                loading="lazy"
                className="border-blue-1/20 mt-3 hidden w-full max-w-130 rounded-md border lg:mx-auto lg:block"
              />
            )}
          </div>
          <div className="ml-2">
            <ScrollArea.Root type="auto" className="w-full overflow-hidden">
              <ScrollArea.Viewport>
                <div
                  className={`flex size-full justify-center gap-x-4 rounded lg:mx-auto lg:max-w-3xl lg:flex-wrap`}
                >
                  {category.options
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((option) => (
                      <Option
                        key={option.title}
                        compact={option.renderType === "compact"}
                        maintainAspect={category.id === "emote"}
                        voted={
                          userVotesQuery.data
                            ? userVotesQuery.data[category.id] === option.id
                            : false
                        }
                        disabled={
                          userVotesQuery.data
                            ? userVotesQuery.data[category.id] !== undefined
                            : false
                        }
                        {...option}
                      />
                    ))}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.ScrollAreaScrollbar
                className="bg-black-1/50 flex h-1 max-w-full touch-none rounded select-none"
                orientation="horizontal"
              >
                <ScrollArea.Thumb className="bg-white-1 relative rounded" />
              </ScrollArea.ScrollAreaScrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CategoriesWithResults() {
  const dggBannerSrc =
    "/Media/dgg_chatter_of_the_year_banner_cutechristiangirl.png";

  const resultsQuery = useQuery({
    queryKey: ["vote_results"],
    queryFn: getVoteResults,
    staleTime: Infinity,
  });

  if (resultsQuery.status !== "success" || !resultsQuery.data) {
    return (
      <p className="flex items-center gap-x-1">
        Crunching numbers... <UpdateIcon className="animate-spin" />
      </p>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {resultsQuery.data.map((category) => (
        <div
          key={category.categoryId}
          id={category.categoryId}
          className="bg-blue-1/10 relative rounded p-2 lg:mx-auto lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-center"
        >
          <div className="w-full text-center opacity-90 lg:sticky lg:top-2 lg:mx-auto">
            <a
              className="transition-all hover:brightness-105"
              href={`#${category.categoryId}`}
            >
              <p className="text-orange-1 text-lg font-bold transition-transform hover:scale-105 hover:-rotate-2 lg:text-3xl">
                {category.categoryTitle}
              </p>
            </a>
            <p className="text-blue-1 line-clamp-3 text-center">
              {category.categoryDescription}
            </p>
            {category.categoryDescription === "dgger" && (
              <img
                src={dggBannerSrc}
                alt="DGGer of the Year banner"
                loading="lazy"
                className="border-blue-1/20 mt-3 hidden w-full max-w-130 rounded-md border lg:mx-auto lg:block"
              />
            )}
            <button
              onClick={async (e) => {
                const wait = (ms: number) =>
                  new Promise((resolve) => setTimeout(resolve, ms));
                const p = document.querySelector(
                  `div[data-parent='${category.categoryId}']`,
                );
                if (p) {
                  for (const node of Array.from(p.children)) {
                    if (!(node instanceof HTMLDivElement)) return;
                    await wait(1250);
                    delete node.dataset.blur;
                  }
                  if (e.target instanceof HTMLButtonElement) {
                    e.target.innerHTML = `${category.totalVotes} total votes!`;
                    e.target.disabled = true;
                  }
                }
              }}
              className="bg-blue-1 mt-4 cursor-pointer rounded-full px-3 py-1 transition-all hover:bg-emerald-600 disabled:bg-green-600"
            >
              Reveal
            </button>
          </div>
          <div className="ml-2">
            <ScrollArea.Root type="auto" className="w-full overflow-hidden">
              <ScrollArea.Viewport>
                <div
                  data-parent={category.categoryId}
                  className="flex size-full justify-center gap-x-4 rounded lg:mx-auto lg:max-w-3xl lg:flex-wrap"
                >
                  {category.options.map((option) => {
                    option.payload.description = "";
                    return (
                      <div
                        data-blur
                        data-winner={option.isWinner}
                        className={
                          "group relative z-50 transition-all duration-300 data-blur:blur-lg data-blur:grayscale"
                        }
                      >
                        {option.isWinner && (
                          <div className="bg-blue-1 absolute top-4 right-4 z-20 rotate-24 animate-[sizepulse_2s_infinite] rounded p-1 lg:top-2 lg:right-2">
                            <p>Winner!</p>
                          </div>
                        )}
                        <p className="absolute top-2 left-0 z-20 rounded bg-emerald-600 p-1">
                          {new Intl.NumberFormat(undefined, {
                            notation: "standard",
                          }).format(option.count)}{" "}
                          vote{option.count !== 1 && "s"}
                        </p>
                        <span className="not-[group-data-blur]:**:blur-none">
                          <Option
                            key={option.title}
                            compact={category.categoryId === "emote"}
                            maintainAspect={category.categoryId === "emote"}
                            voted={false}
                            disabled={true}
                            {...option.payload}
                          />
                        </span>
                        <div
                          className={clsx("absolute bottom-6 left-6 w-1", {
                            "bg-blue-1": !option.isWinner,
                            "bg-orange-1": option.isWinner,
                          })}
                          style={{ height: `${option.percentage / 1.6}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.ScrollAreaScrollbar
                className="bg-black-1/50 flex h-1 max-w-full touch-none rounded select-none"
                orientation="horizontal"
              >
                <ScrollArea.Thumb className="bg-white-1 relative rounded" />
              </ScrollArea.ScrollAreaScrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          </div>
        </div>
      ))}
    </div>
  );
}

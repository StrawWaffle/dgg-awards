import "@/index.css";
import { LapTimerIcon, LockClosedIcon } from "@radix-ui/react-icons";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Acknowledgments } from "@/components/Acknowledgments";
import { AuthButton } from "@/components/AuthButton";
import { Categories, CategoriesWithResults } from "@/components/Categories";
import { TopPosts } from "@/components/TopPosts";
import { Sidebar } from "@/components/Sidebar";
import { Status } from "@/components/Status";
import { VoteSummary } from "@/components/VoteSummary";
import { fetchAuthSession, fetchConfig } from "@/lib/queries";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});

export function App() {
  const config = useQuery(
    { queryKey: ["config"], queryFn: fetchConfig },
    queryClient,
  );
  const me = useQuery(
    { queryKey: ["me"], queryFn: fetchAuthSession, retry: false },
    queryClient,
  );

  // Admins can open /?preview=voting or /?preview=results to see either
  // page whatever mode the site is in. Everyone else gets the real mode.
  const requested = new URLSearchParams(window.location.search).get("preview");
  const preview =
    me.data?.admin && (requested === "voting" || requested === "results")
      ? requested
      : null;
  const viewingMode =
    preview === "results"
      ? "reviewing"
      : preview === "voting"
        ? "voting"
        : config.data?.viewingMode;

  return (
    <QueryClientProvider client={queryClient}>
      {preview && (
        <div className="bg-black-1 text-white-1 sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 px-3 py-2 text-sm">
          <span>
            Admin preview of the {preview === "results" ? "results" : "voting"} page.
            Visitors see the site in {config.data?.viewingMode ?? "?"} mode.
          </span>
          <a className="text-orange-1 underline" href="/">
            Leave preview
          </a>
        </div>
      )}
      <span className="absolute top-0" id="top" />
      <Sidebar />
      <AuthButton />
      <main>
        <div className="mt-2 flex h-screen flex-col items-center justify-center space-y-2 p-4 lg:-mt-36 lg:mb-36">
          <div className="flex items-center justify-between">
            <a
              href="#top"
              className="text-orange-1 animate-[sizepulse_2s_infinite] text-xl font-bold lg:text-4xl lg:tracking-wider"
            >
              The 2025
              <img
                className="inline h-10 lg:h-14"
                src="/Media/destiny-logo.png"
              />
              Awards
            </a>
          </div>
          {viewingMode !== "reviewing" ? (
            <Status />
          ) : (
            <p className="text-orange-1 text-xl font-bold">
              Thanks for participating! View the results below!
            </p>
          )}
          {viewingMode === "locked" && (
            <p className="flex items-center gap-x-1">
              <LockClosedIcon /> This page has been locked by an admin.
            </p>
          )}
          {viewingMode === "idle" && (
            <p className="flex items-center gap-x-1">
              <LapTimerIcon />
              An admin set this page to read-only.
            </p>
          )}
          {viewingMode === "voting" && (
            <a
              href={"#nominees"}
              className="bg-black-1/50 mt-4 block cursor-pointer rounded p-1"
            >
              <p className="text-green-300">Check out the nominees!</p>
            </a>
          )}
        </div>
        {viewingMode === "reviewing" ? (

          <div className="relative mx-auto">
            <CategoriesWithResults preview={preview === "results"} />
            <TopPosts />
          </div>
        ) : (
          <div className="relative mx-auto">
            <span className="absolute -top-8" id="nominees" />
            <Categories />
            <div className="justify-center flex">
              <span className="absolute top-0" id="next" />
              <VoteSummary />
            </div>
          </div>
        )}
      </main>
      <footer className="relative p-2 text-xs opacity-50 lg:mx-auto lg:max-w-7xl">
        <Acknowledgments />
        <a
          className="absolute right-2 bottom-2"
          target="_blank"
          href="https://git.defeten.com/defeten/dgga25"
        >
          <img
            className="h-8 transition-all hover:brightness-105"
            src="/Media/dggL.png"
          />
        </a>
      </footer>
    </QueryClientProvider>
  );
}

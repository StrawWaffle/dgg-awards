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
import { fetchConfig } from "@/lib/queries";

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

  return (
    <QueryClientProvider client={queryClient}>
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
          {config.data?.viewingMode !== "reviewing" ? (
            <Status />
          ) : (
            <p className="text-orange-1 text-xl font-bold">
              Thanks for participating! View the results below!
            </p>
          )}
          {config.data?.viewingMode === "locked" && (
            <p className="flex items-center gap-x-1">
              <LockClosedIcon /> This page has been locked by an admin.
            </p>
          )}
          {config.data?.viewingMode === "idle" && (
            <p className="flex items-center gap-x-1">
              <LapTimerIcon />
              An admin set this page to read-only.
            </p>
          )}
          {config.data?.viewingMode === "voting" && (
            <a
              href={"#nominees"}
              className="bg-black-1/50 mt-4 block cursor-pointer rounded p-1"
            >
              <p className="text-green-300">Check out the nominees!</p>
            </a>
          )}
        </div>
        {config.data?.viewingMode === "reviewing" ? (

          <div className="relative mx-auto">
            <CategoriesWithResults />
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

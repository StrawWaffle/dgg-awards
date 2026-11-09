import { fetchAuthSession } from "@/lib/queries";
import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import type { MeApiResponse } from "@/lib/types";

export function AuthButton() {
  const query = useQuery<MeApiResponse>({
    queryKey: ["me"],
    queryFn: fetchAuthSession,
    staleTime: Infinity,
  });

  if (!query.data) {
    return (
      <a
        href="/signin"
        className="text-orange-1 bg-orange-1/15 hover:bg-orange-1/25 fixed top-2 right-2 z-99 flex w-18 items-center gap-x-1 rounded-sm p-0.5 backdrop-blur-xs transition-colors"
      >
        Sign in
        <ExternalLinkIcon />
      </a>
    );
  }

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    await fetch("/signout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <div className="fixed top-2 right-2 z-99 flex items-center gap-x-1">
      <span
        onClick={({ shiftKey }) => shiftKey && window.location.replace("/admin")}
        className="flex min-w-18 items-center gap-x-1 rounded-sm bg-emerald-800/50 p-0.5 text-emerald-400 backdrop-blur-xs select-none"
      >
        <img className="h-4" src="/Media/widepeepohappy.png" />
        {query.data.name}
      </span>
      <button
        onClick={handleSignOut}
        className="text-orange-1 bg-orange-1/15 hover:bg-orange-1/25 rounded-sm p-0.5 px-2 backdrop-blur-xs transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

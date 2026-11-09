import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { fetchAuthSession, fetchConfig, submitVote } from "@/lib/queries";
import { nowS } from "@/lib/util";
import type { MeApiResponse } from "@/lib/types";

type Props = {
  disabled: boolean;
  categoryId: string;
  id: string;
  voted: boolean;
};

export function VoteButton(props: Props) {
  const now = nowS();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
  });

  const authQuery = useQuery<MeApiResponse>({
    queryKey: ["me"],
    queryFn: fetchAuthSession,
  });

  const voteMutation = useMutation({
    mutationKey: ["vote", props.categoryId, props.id],
    mutationFn: () => submitVote(props.categoryId, props.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userVotes"] });
    },
  });

  if (authQuery.status !== "success" || authQuery.data === undefined) {
    return null;
  }

  if (configQuery.status !== "success" || configQuery.data === undefined) {
    return null;
  }

  if (!configQuery.data.startTime || !configQuery.data.endTime) {
    return null;
  }

  const votingIsActive =
    now > configQuery.data.startTime && now < configQuery.data.endTime;

  if (
    props.disabled ||
    !votingIsActive ||
    configQuery.data.viewingMode !== "voting"
  ) {
    if (props.voted) {
      return <p className="text-blue-2 text-sm">Vote recorded!</p>;
    }
    return null;
  }

  return (
    <button
      onClick={() => {
        voteMutation.mutate();
      }}
      className={
        "w-full cursor-pointer rounded bg-green-900 p-1 text-sm text-green-400 hover:bg-green-800"
      }
    >
      Vote
    </button>
  );
}

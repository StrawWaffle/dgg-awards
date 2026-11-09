import { ThickArrowUpIcon } from "@radix-ui/react-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "radix-ui";
import { fetchAllUsers, makeAdmin } from "@/lib/queries";

export function UsersTab() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchAllUsers });
  const makeAdminMutation = useMutation({
    mutationFn: makeAdmin,
    onSuccess: async () =>
      await queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <Tabs.Content value="users" className="space-y-2 outline-none">
      {usersQuery.data?.map((user) => (
        <div
          className="flex items-center gap-x-1 rounded bg-neutral-300 p-1"
          key={user.uid}
        >
          {user.name}: {user.uid}
          <span className="grow" />
          {!user.admin && (
            <button
              onClick={() => makeAdminMutation.mutate(user.uid)}
              className="flex items-center gap-x-1 rounded p-1 hover:bg-neutral-100"
            >
              <ThickArrowUpIcon /> Make admin
            </button>
          )}
        </div>
      ))}
    </Tabs.Content>
  );
}

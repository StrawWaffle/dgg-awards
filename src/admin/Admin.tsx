import { ActionsTab } from "@/admin/components/ActionsTab";
import { NomineesTab } from "@/admin/components/NomineesTab";
import { SettingsTab } from "@/admin/components/SettingsTab";
import { TabTrigger } from "@/admin/components/TabTrigger";
import { UsersTab } from "@/admin/components/UsersTab";
import { VotesTab } from "@/admin/components/VotesTab";
import {
  BarChartIcon,
  GearIcon,
  HomeIcon,
  PersonIcon,
  PlusCircledIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import * as Tabs from "@radix-ui/react-tabs";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { fetchAuthSession } from "@/lib/queries";

const queryClient = new QueryClient();

export function Admin() {
  const meQuery = useQuery(
    { queryKey: ["me"], queryFn: fetchAuthSession },
    queryClient,
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-full flex-col bg-neutral-50 font-mono text-neutral-900">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
          <h1 className="flex items-center text-lg font-bold tracking-tight uppercase">
            <a href="/" className="mr-2">
              <HomeIcon />
            </a>
            DGG AWARDS 2025 :: Admin
          </h1>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            {meQuery.data?.name || "noauth"}
          </div>
        </header>

        <Tabs.Root defaultValue="nominees" className="flex flex-1 flex-col">
          <div className="px-6 pt-6">
            <Tabs.List className="flex w-fit gap-2 rounded-lg bg-neutral-200/50 p-1">
              <TabTrigger value="nominees" icon={<StackIcon />}>
                Nominees
              </TabTrigger>
              <TabTrigger value="settings" icon={<GearIcon />}>
                Configuration
              </TabTrigger>
              <TabTrigger value="actions" icon={<PlusCircledIcon />}>
                Management
              </TabTrigger>
              <TabTrigger value="users" icon={<PersonIcon />}>
                Users
              </TabTrigger>
              <TabTrigger value="votes" icon={<BarChartIcon />}>
                Votes
              </TabTrigger>
            </Tabs.List>
          </div>

          <div className="p-2 w-full">
            <Tabs.Content value="nominees">
              <NomineesTab />
            </Tabs.Content>
            <Tabs.Content value="settings">
              <SettingsTab />
            </Tabs.Content>
            <Tabs.Content value="actions">
              <ActionsTab />
            </Tabs.Content>
            <Tabs.Content value="users">
              <UsersTab />
            </Tabs.Content>
            <Tabs.Content value="votes">
              <VotesTab />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </QueryClientProvider>
  );
}

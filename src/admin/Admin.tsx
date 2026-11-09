import { AdminsTab } from "@/admin/components/AdminsTab";
import { NomineeEditor } from "@/admin/components/editor/NomineeEditor";
import { SettingsTab } from "@/admin/components/SettingsTab";
import { TabTrigger } from "@/admin/components/TabTrigger";
import { VotesTab } from "@/admin/components/VotesTab";
import { BarChartIcon, GearIcon, HomeIcon, PersonIcon, StackIcon } from "@radix-ui/react-icons";
import { Tabs } from "radix-ui";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fetchAuthSession, fetchConfig } from "@/lib/queries";

const queryClient = new QueryClient();

export function Admin() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>
  );
}

function AdminPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: fetchAuthSession });
  const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig });

  return (
    <div className="min-h-screen w-full bg-neutral-50 font-mono text-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-neutral-200 bg-white px-6 py-4">
        <h1 className="flex items-center text-lg font-bold tracking-tight uppercase">
          <a href="/" className="mr-2" aria-label="Site">
            <HomeIcon />
          </a>
          DGG Awards {config.data?.awardYear ?? ""} :: Admin
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <a className="text-emerald-800 underline" href="/?preview=voting" target="_blank" rel="noopener">
            Preview voting
          </a>
          <a className="text-emerald-800 underline" href="/?preview=results" target="_blank" rel="noopener">
            Preview results
          </a>
          <span className="text-xs text-neutral-500">{me.data?.name}</span>
        </div>
      </header>

      <Tabs.Root defaultValue="nominees">
        <Tabs.List className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-6">
          <TabTrigger value="nominees" icon={<StackIcon />}>
            Nominees
          </TabTrigger>
          <TabTrigger value="settings" icon={<GearIcon />}>
            Settings
          </TabTrigger>
          <TabTrigger value="admins" icon={<PersonIcon />}>
            Admins
          </TabTrigger>
          <TabTrigger value="votes" icon={<BarChartIcon />}>
            Votes
          </TabTrigger>
        </Tabs.List>

        <div className="p-4 md:p-6">
          <Tabs.Content value="nominees" className="outline-none">
            <NomineeEditor />
          </Tabs.Content>
          <Tabs.Content value="settings" className="outline-none">
            <SettingsTab />
          </Tabs.Content>
          <Tabs.Content value="admins" className="outline-none">
            <AdminsTab />
          </Tabs.Content>
          <Tabs.Content value="votes" className="outline-none">
            <VotesTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

import "@/admin/admin.css";
import { useEffect, useState } from "react";
import { AdminsTab } from "@/admin/components/AdminsTab";
import { HistoryTab } from "@/admin/components/history/HistoryTab";
import { NomineeEditor } from "@/admin/components/editor/NomineeEditor";
import { SettingsTab } from "@/admin/components/SettingsTab";
import { SideLabel, TabTrigger, sideItemClass } from "@/admin/components/TabTrigger";
import { VotesTab } from "@/admin/components/VotesTab";
import { type Theme, useTheme } from "@/admin/theme";
import { useStored } from "@/admin/useStored";
import {
  BarChartIcon,
  MagicWandIcon,
  CounterClockwiseClockIcon,
  DesktopIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  ExternalLinkIcon,
  EyeOpenIcon,
  GearIcon,
  HomeIcon,
  MoonIcon,
  PersonIcon,
  StackIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import { Tabs } from "radix-ui";
import clsx from "clsx";
import { MutationCache, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fetchAuthSession, fetchConfig } from "@/lib/queries";

// Every change made here lands in the edit history, so refresh it after any.
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
  }),
});

const tabs = ["nominees", "settings", "admins", "votes", "history"] as const;
type Tab = (typeof tabs)[number];
const tabFromHash = (): Tab => {
  const hash = location.hash.slice(1);
  return (tabs as readonly string[]).includes(hash) ? (hash as Tab) : "nominees";
};

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
  const [theme, setTheme] = useTheme();
  const [collapsed, setCollapsed] = useStored("sidebar-collapsed", false);
  // The open tab lives in the address (#votes), so a reload stays on it.
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  const year = config.data?.awardYear;
  useEffect(() => {
    document.title = `Admin | DGG Awards${year ? ` ${year}` : ""}`;
  }, [year]);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(v) => {
        setTab(v as Tab);
        history.replaceState(null, "", `#${v}`);
      }}
      orientation="vertical"
      className="flex min-h-screen w-full flex-col bg-neutral-50 font-mono text-neutral-900 md:flex-row"
    >
      <aside
        className={clsx(
          "flex shrink-0 flex-col gap-2 border-b border-neutral-200 bg-white p-2",
          "md:sticky md:top-0 md:h-screen md:border-r md:border-b-0",
          collapsed ? "md:w-14" : "md:w-56",
        )}
      >
        <div className={clsx("flex items-center gap-2 px-1", collapsed && "md:flex-col")}>
          <a href="/" className={clsx("grow text-sm font-bold uppercase", collapsed && "md:hidden")}>
            DGG Awards {year}
          </a>
          <button
            type="button"
            className="hidden rounded p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 md:block"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          >
            {collapsed ? <DoubleArrowRightIcon /> : <DoubleArrowLeftIcon />}
          </button>
        </div>

        <Tabs.List aria-label="Sections" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <TabTrigger value="nominees" icon={<StackIcon />} collapsed={collapsed}>
            Nominees
          </TabTrigger>
          <TabTrigger value="settings" icon={<GearIcon />} collapsed={collapsed}>
            Settings
          </TabTrigger>
          <TabTrigger value="admins" icon={<PersonIcon />} collapsed={collapsed}>
            Admins
          </TabTrigger>
          <TabTrigger value="votes" icon={<BarChartIcon />} collapsed={collapsed}>
            Votes
          </TabTrigger>
          <TabTrigger value="history" icon={<CounterClockwiseClockIcon />} collapsed={collapsed}>
            History
          </TabTrigger>
        </Tabs.List>

        <div className="flex flex-wrap items-center gap-1 border-t border-neutral-200 pt-2 md:mt-auto md:flex-col md:items-stretch">
          <SideLink href="/?preview=voting" icon={<EyeOpenIcon />} collapsed={collapsed}>
            Preview voting
          </SideLink>
          <SideLink href="/?preview=results" icon={<BarChartIcon />} collapsed={collapsed}>
            Preview results
          </SideLink>
          <SideLink href="/" icon={<HomeIcon />} collapsed={collapsed}>
            Open the site
          </SideLink>
          <SideLink href="/lab" icon={<MagicWandIcon />} collapsed={collapsed}>
            Open the lab
          </SideLink>
          <ThemeSwitch theme={theme} setTheme={setTheme} collapsed={collapsed} />
          <p
            className={clsx("truncate px-3 py-1 text-xs text-neutral-500 max-md:ml-auto", collapsed && "md:hidden")}
            title="Signed in as"
          >
            {me.data?.name}
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
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
        <Tabs.Content value="history" className="outline-none">
          <HistoryTab />
        </Tabs.Content>
      </main>
    </Tabs.Root>
  );
}

function SideLink({
  href,
  icon,
  collapsed,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  collapsed: boolean;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={children}
      className={sideItemClass(collapsed)}
    >
      {icon}
      <SideLabel collapsed={collapsed} iconOnPhones>
        {children}
      </SideLabel>
      {!collapsed && <ExternalLinkIcon className="ml-auto hidden text-neutral-400 md:block" />}
    </a>
  );
}

const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System theme", icon: <DesktopIcon /> },
  { value: "light", label: "Light theme", icon: <SunIcon /> },
  { value: "dark", label: "Dark theme", icon: <MoonIcon /> },
];

/** Light, dark or follow the system. Collapsed, one button cycles through them. */
function ThemeSwitch({
  theme,
  setTheme,
  collapsed,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  collapsed: boolean;
}) {
  const current = themes.find((t) => t.value === theme) ?? themes[0]!;
  const next = themes[(themes.indexOf(current) + 1) % themes.length]!;
  return (
    <>
      {collapsed && (
        <button
          type="button"
          className={clsx(sideItemClass(true), "hidden md:flex")}
          onClick={() => setTheme(next.value)}
          title={`${current.label}. Click for ${next.label.toLowerCase()}.`}
          aria-label={`${current.label}. Switch to ${next.label.toLowerCase()}.`}
        >
          {current.icon}
        </button>
      )}
      <ThemeRadios theme={theme} setTheme={setTheme} className={clsx(collapsed && "md:hidden")} />
    </>
  );
}

function ThemeRadios({
  theme,
  setTheme,
  className,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Theme" className={clsx("flex gap-1 px-1 py-1", className)}>
      {themes.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={theme === t.value}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.value)}
          className={clsx(
            "rounded border p-2",
            theme === t.value
              ? "border-neutral-300 bg-neutral-100 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-900",
          )}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

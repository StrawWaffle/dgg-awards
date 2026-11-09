import { DesktopIcon, MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { MusicBar } from "@/lab/MusicBar";
import { type Theme, useLabTheme } from "@/lab/theme";

const themeCycle: Record<Theme, { next: Theme; icon: React.ReactNode; label: string }> = {
  system: { next: "light", icon: <DesktopIcon />, label: "Theme: system" },
  light: { next: "dark", icon: <SunIcon />, label: "Theme: light" },
  dark: { next: "system", icon: <MoonIcon />, label: "Theme: dark" },
};

/** The header's right-hand controls, shared by the lab and the public pages: music and theme. */
export function HeaderTools() {
  const { theme, setTheme } = useLabTheme();
  const cycle = themeCycle[theme];
  return (
    <>
      <MusicBar />
      <button
        type="button"
        className="cozy-btn round h-10 w-10"
        onClick={() => setTheme(cycle.next)}
        aria-label={`${cycle.label}. Click for ${cycle.next}.`}
        title={`${cycle.label}. Click for ${cycle.next}.`}
      >
        {cycle.icon}
      </button>
    </>
  );
}

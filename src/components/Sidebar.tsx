import { useEffect, useState } from "react";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { animated, useSpring } from "@react-spring/web";
import { useQuery } from "@tanstack/react-query";
import { useClickAway } from "@uidotdev/usehooks";
import clsx from "clsx";
import { NavigationMenu } from "radix-ui";
import { fetchNominees } from "@/lib/queries";

export function Sidebar() {
  const query = useQuery({ queryKey: ["nominees"], queryFn: fetchNominees });
  const [recentlySelected, setRecentlySelected] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => {
    setOpen(false);
  });
  const [{ sidebarWidth, buttonOpacity }, api] = useSpring(() => ({
    sidebarWidth: 0,
    buttonOpacity: 1,
    config: {
      duration: 100,
    },
  }));

  useEffect(() => {
    if (open) {
      api.start({ sidebarWidth: window.innerWidth / 2, buttonOpacity: 0 });
    } else {
      api.start({ sidebarWidth: 0, buttonOpacity: 1 });
    }
  }, [open]);

  return (
    <animated.div
      className={clsx(
        "bg-black-1/80 fixed top-0 z-10 h-full touch-none lg:max-w-1/5",
        {
          "border-r-white-1 border-r backdrop-blur-xs": open,
        },
      )}
      style={{ width: sidebarWidth }}
    >
      <animated.div style={{ opacity: buttonOpacity }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((c) => !c);
          }}
          className={clsx(
            "bg-black-1/80 absolute top-2 left-2 flex cursor-pointer items-center gap-x-1 rounded-sm p-0.5 backdrop-blur-xs",
            { "z-10": !open, "-z-10": open },
          )}
        >
          <HamburgerMenuIcon className="inline" /> Navigation
        </button>
      </animated.div>
      {open && (
        <NavigationMenu.Root
          className="h-full transition-opacity delay-100"
          orientation="vertical"
        >
          <animated.div
            ref={ref}
            className="h-full p-4 text-center"
            style={{ opacity: open ? 1 : 0 }}
          >
            <NavigationMenu.List className="h-full space-y-2">
              <NavigationMenu.Item>
                <NavigationMenu.Trigger className="w-full text-center">
                  <a
                    href="#top"
                    onClick={() => setOpen(false)}
                    className="text-orange-1 border-blue-1 line-clamp-1 rounded-lg border px-2 py-1 text-xs font-bold"
                  >
                    Top
                  </a>
                </NavigationMenu.Trigger>
              </NavigationMenu.Item>
              <NavigationMenu.Item>
                <NavigationMenu.Trigger className="w-full text-center">
                  <a
                    href="#nominees"
                    onClick={() => setOpen(false)}
                    className="text-orange-1 border-blue-1 line-clamp-1 rounded-lg border px-2 py-1 text-xs font-bold"
                  >
                    Nominees
                  </a>
                </NavigationMenu.Trigger>
              </NavigationMenu.Item>
              {query.data?.map((category) => {
                return (
                  <NavigationMenu.Item key={category.id}>
                    <NavigationMenu.Trigger className="w-full text-center">
                      <a
                        href={`#${category.id}`}
                        onClick={() => {
                          setOpen(false);
                          setRecentlySelected(category.id);
                        }}
                        className={clsx(
                          "text-orange-1 border-blue-1 line-clamp-1 rounded-lg border px-2 py-1 text-xs",
                          {
                            "text-green-400": recentlySelected === category.id,
                          },
                        )}
                      >
                        {category.title}
                      </a>
                    </NavigationMenu.Trigger>
                  </NavigationMenu.Item>
                );
              })}
            </NavigationMenu.List>
          </animated.div>
        </NavigationMenu.Root>
      )}
    </animated.div>
  );
}

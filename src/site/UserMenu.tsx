import { useEffect, useRef, useState } from "react";
import type { Me } from "@/site/Site";

type Profile = {
  name: string;
  url: string;
  photoUrl: string | null;
  tier: string | null;
  team: string | null;
  memberSince: string | null;
};

/**
 * Who you are, at the right of the header: your destiny.gg picture and name.
 * Hovering (or clicking, on touch) opens a menu: subscriber tier, team,
 * member since, admin, your destiny.gg profile, the admin page, and signing
 * out. Signed out, a Sign in button that brings you back to this page.
 */
export function UserMenu({ me }: { me: Me | undefined }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!me) return;
    fetch("/api/me/profile")
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((d) => setProfile(d.profile))
      .catch(() => {});
  }, [me]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", outside);
    addEventListener("keydown", escape);
    return () => {
      removeEventListener("pointerdown", outside);
      removeEventListener("keydown", escape);
    };
  }, [open]);

  if (me === undefined) return null;
  if (!me) {
    return (
      <a className="cozy-btn primary" href={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`}>
        Sign in
      </a>
    );
  }

  // Hover opens it; leaving closes it after a moment, so the gap to the menu can be crossed.
  const enter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  };
  const photo = profile?.photoUrl;

  return (
    <div ref={box} className="relative" onPointerEnter={(e) => e.pointerType === "mouse" && enter()} onPointerLeave={(e) => e.pointerType === "mouse" && leave()}>
      <button
        type="button"
        className="cozy-btn h-10 gap-2 py-0! pr-3! pl-1!"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Signed in as ${me.name}`}
      >
        <Avatar photo={photo} name={me.name} size={32} />
        <span className="hidden max-w-36 truncate sm:inline">{me.name}</span>
      </button>
      {open && (
        <div role="menu" className="cozy-panel absolute top-full right-0 z-40 mt-2 w-64 space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar photo={photo} name={me.name} size={48} />
            <div className="min-w-0">
              <p className="truncate font-black">{me.name}</p>
              {profile?.memberSince && (
                <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  Member since {profile.memberSince}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {me.admin && <span className="cozy-chip coral">Admin</span>}
            {profile?.tier && <span className="cozy-chip green">{profile.tier}</span>}
            {profile?.team && <span className="cozy-chip">{/^team /i.test(profile.team) ? profile.team : `Team ${profile.team}`}</span>}
          </div>
          <div className="space-y-0.5 border-t-2 pt-2 text-sm font-bold" style={{ borderColor: "var(--panel-border)" }}>
            {profile?.url && (
              <a role="menuitem" className="cozy-row block rounded-xl px-2 py-1.5" href={profile.url} target="_blank" rel="noopener noreferrer">
                Your destiny.gg profile ↗
              </a>
            )}
            {me.admin && (
              <a role="menuitem" className="cozy-row block rounded-xl px-2 py-1.5" href="/admin">
                Admin page
              </a>
            )}
            <form method="post" action="/signout">
              <button role="menuitem" type="submit" className="cozy-row block w-full rounded-xl px-2 py-1.5 text-left">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** The destiny.gg picture, or the name's first letter. */
function Avatar({ photo, name, size }: { photo: string | null | undefined; name: string; size: number }) {
  return photo ? (
    <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black"
      style={{ width: size, height: size, background: "var(--primary)", color: "var(--primary-text)", fontSize: size * 0.45 }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

import type { ComponentProps, PropsWithChildren } from "react";

type PossibleLinkProps = PropsWithChildren<
  Omit<ComponentProps<"a">, "href"> & {
    /** Style to be applied to the <a> tag if href is not undefined. */
    activeClassName?: string;
    href: string | null;
  }
>;

/** If the options props contain a url, wrap contents in an <a> tag. Otherwise, return the contents. */
export function PossibleLink({
  children,
  activeClassName,
  ...props
}: PossibleLinkProps) {
  if (!props.href) return <>{children}</>;
  return (
    <a {...props} href={props.href} className={activeClassName} target="_blank">
      {children}
    </a>
  );
}

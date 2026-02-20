import type { ComponentProps } from "react";

export function Logo(props: ComponentProps<"img">) {
  return <img src="/logo192.png" alt="Logo" {...props} />;
}

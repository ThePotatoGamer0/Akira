import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle.js";

export function WebUiShell(props: { children: ReactNode }) {
  return (
    <>
      <ThemeToggle />
      <div className="wrapper webui-root">{props.children}</div>
    </>
  );
}

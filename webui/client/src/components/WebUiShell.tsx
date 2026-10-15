import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle.js";

export function WebUiShell(props: { children: ReactNode; compact?: boolean }) {
  if (props.compact) {
    return <div className="webui-pip-root">{props.children}</div>;
  }
  return (
    <>
      <ThemeToggle />
      <div className="wrapper webui-root">{props.children}</div>
    </>
  );
}

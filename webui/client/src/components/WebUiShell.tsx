import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle.js";

export function WebUiShell(props: {
  children: ReactNode;
  compact?: boolean;
  roomy?: boolean;
  /** Left-column chrome on wide screens; ignored for compact/roomy shells. */
  rail?: boolean;
}) {
  if (props.compact) {
    return <div className="webui-pip-root">{props.children}</div>;
  }
  const classes = ["wrapper", "webui-root"];
  if (props.roomy) classes.push("webui-root--roomy");
  if (props.rail) classes.push("webui-root--rail");
  return (
    <>
      <ThemeToggle />
      <div className={classes.join(" ")}>{props.children}</div>
    </>
  );
}

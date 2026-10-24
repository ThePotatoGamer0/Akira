import { useEffect } from "react";
import { NappingNotice } from "../NappingNotice.js";

const PAGE_TITLE = "Akira - WebUI";
const DOWN_TITLE = "Akira is taking a nap";
const POLL_MS = 8000;

export function ApiDownScreen(props: { onRetry: () => void | Promise<boolean> }) {
  useEffect(() => {
    const previous = document.title;
    document.title = DOWN_TITLE;
    return () => {
      document.title = previous || PAGE_TITLE;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void props.onRetry();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [props.onRetry]);

  return (
    <NappingNotice body="She wandered off for a bit. Peek back in a moment?" onPoke={props.onRetry} />
  );
}

import { isDiscordActivityContext } from "../hooks/useDiscordSDK.js";

/** Install the service worker on the real website, not inside Discord. */
export function registerPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  if (isDiscordActivityContext()) return;
  const start = () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* Opening as a page still works. */
    });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
}

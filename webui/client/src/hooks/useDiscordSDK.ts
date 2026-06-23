import { useCallback, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";

type State =
  | { status: "idle" | "loading" }
  | { status: "ready"; discordUserId: string; sdk: DiscordSDK }
  | { status: "error"; message: string };

/**
 * Initialise the Discord Embedded App SDK (Activity context only).
 */
export function useDiscordSDK(clientId: string | undefined) {
  const [state, setState] = useState<State>({ status: "idle" });

  const connect = useCallback(async () => {
    if (!clientId) {
      setState({ status: "error", message: "Missing VITE_DISCORD_CLIENT_ID" });
      return;
    }
    setState({ status: "loading" });
    try {
      const sdk = new DiscordSDK(clientId);
      await sdk.ready();
      const { user } = await sdk.commands.authenticate({});
      if (!user?.id) {
        setState({ status: "error", message: "Discord did not return a user id." });
        return;
      }
      setState({ status: "ready", discordUserId: user.id, sdk });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to start Discord SDK",
      });
    }
  }, [clientId]);

  return { state, connect };
}

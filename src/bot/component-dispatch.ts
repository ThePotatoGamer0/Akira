import type { ButtonInteraction, StringSelectMenuInteraction } from "discord.js";
import { handleCollectionButton } from "./commands/collection.js";
import { handleLookupButton, handleLookupSelect } from "./commands/lookup.js";
import { handleBurnConfirmButton } from "./commands/burn.js";
import { handleMultiburnButton } from "./commands/multiburn.js";
import { handleMultitradeButton } from "./commands/multitrade.js";
import { handlePrestigeButton } from "./commands/prestige.js";
import { handleShopButton } from "./commands/shop.js";
import { handleTransferButton } from "./commands/transfer.js";
import { handleKarutaOverrideButton } from "./karuta-override.js";

/** Run the button or menu handler for this custom id. False when nothing matched. */
export async function dispatchMessageComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.isButton()) {
    if (await handleKarutaOverrideButton(interaction)) return true;
    if (await handleBurnConfirmButton(interaction)) return true;
    if (await handleMultiburnButton(interaction)) return true;
    if (await handleMultitradeButton(interaction)) return true;
    if (await handleTransferButton(interaction)) return true;
    if (await handleShopButton(interaction)) return true;
    if (await handlePrestigeButton(interaction)) return true;
    if (await handleCollectionButton(interaction)) return true;
    return handleLookupButton(interaction);
  }
  if (interaction.isStringSelectMenu()) return handleLookupSelect(interaction);
  return false;
}

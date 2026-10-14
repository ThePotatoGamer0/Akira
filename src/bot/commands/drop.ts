import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { SLOT_EMOJIS } from "../../game/balance.js";
import { commitDrop, prepareDrop } from "../../game/drops.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { scheduleDropExpiry } from "../drop-expiry.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { renderDropMessage } from "../drop-message.js";
import { sendGameError } from "../reply.js";

export const drop: AkiraCommand = {
  data: new SlashCommandBuilder().setName("drop").setDescription("Set three cards down in the drop channel"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({
        content: "Akira only drops cards inside a server channel.",
        ephemeral: true,
      });
      return;
    }

    let committed = false;
    try {
      const prepared = await prepareDrop({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        discordId: interaction.user.id,
        username: interaction.user.username,
      });
      await interaction.deferReply();
      const payload = await renderDropMessage(prepared);
      await interaction.editReply(payload);
      const message = await interaction.fetchReply();
      await commitDrop(prepared, message.id);
      committed = true;
      void queueCooldownReminder(interaction.user.id, "DROP");
      scheduleDropExpiry(_client, {
        messageId: message.id,
        channelId: prepared.channelId,
        expiresAt: prepared.expiresAt,
      });
      for (const emoji of SLOT_EMOJIS) {
        await message.react(emoji);
      }
    } catch (err) {
      if (interaction.deferred && !committed) {
        await interaction.deleteReply().catch(() => undefined);
      }
      if (err instanceof GameError && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: err.message, ephemeral: true });
        return;
      }
      await sendGameError(interaction, err);
    }
  },
};

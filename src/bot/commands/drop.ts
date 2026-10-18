import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { icon } from "../../utils/icons.js";
import { commitDrop, prepareDrop, releaseDropCooldown } from "../../game/drops.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { scheduleDropExpiry } from "../drop-expiry.js";
import { scheduleGrabNotices } from "../grab-notices.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { renderDropMessage } from "../drop-message.js";
import { sendGameError } from "../reply.js";

const settingDown = new Set<string>();

export const drop: AkiraCommand = {
  data: new SlashCommandBuilder().setName("drop").setDescription("Set cards down in the drop channel"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({
        content: "Akira only drops cards inside a server channel.",
        ephemeral: true,
      });
      return;
    }

    if (settingDown.has(interaction.user.id)) {
      throw new GameError("drop-busy", "Akira is still setting those cards down.");
    }
    settingDown.add(interaction.user.id);
    let prepared: Awaited<ReturnType<typeof prepareDrop>> | null = null;
    let committed = false;
    try {
      prepared = await prepareDrop({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        discordId: interaction.user.id,
        username: interaction.user.username,
      });
      await interaction.deferReply();
      const payload = await renderDropMessage(prepared);
      await interaction.editReply(payload);
      const message = await interaction.fetchReply();
      const createdAt = await commitDrop(prepared, message.id);
      committed = true;
      void queueCooldownReminder(interaction.user.id, "DROP");
      scheduleGrabNotices(_client, {
        messageId: message.id,
        channelId: prepared.channelId,
        createdAt,
      });
      scheduleDropExpiry(_client, {
        messageId: message.id,
        channelId: prepared.channelId,
        expiresAt: prepared.expiresAt,
      });
      const slotIcons = ["slot-1", "slot-2", "slot-3", "slot-4"] as const;
      for (const key of slotIcons.slice(0, prepared.slots.length)) {
        await message.react(icon(key));
      }
    } catch (err) {
      if (prepared && !committed) {
        await releaseDropCooldown(prepared.userId).catch(() => undefined);
      }
      if (interaction.deferred && !committed) {
        await interaction.deleteReply().catch(() => undefined);
      }
      if (err instanceof GameError && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: err.message, ephemeral: true });
        return;
      }
      await sendGameError(interaction, err);
    } finally {
      settingDown.delete(interaction.user.id);
    }
  },
};

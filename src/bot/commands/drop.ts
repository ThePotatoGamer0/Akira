import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { icon } from "../../utils/icons.js";
import { commitDrop, prepareDrop, releaseDropCooldown } from "../../game/drops.js";
import { dropShape } from "../../game/drop-stock.js";
import { GameError } from "../../game/errors.js";
import { serverDefaultFrame } from "../../game/frames.js";
import { activeEffects } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { scheduleDropExpiry } from "../drop-expiry.js";
import { dropMessageFromStrip, renderDropMessage } from "../drop-message.js";
import { restoreDrop, takeDrop, type ShelvedDrop } from "../drop-shelf.js";
import { scheduleGrabNotices } from "../grab-notices.js";
import { queueCooldownReminder } from "../reminder-schedule.js";
import { sendGameError } from "../reply.js";
import { sendWishlistDropDms } from "../wishlist-dm.js";

const settingDown = new Set<string>();

export const drop: AkiraCommand = {
  data: new SlashCommandBuilder().setName("drop").setDescription("Set cards down in the drop channel"),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
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
    let shelved: ShelvedDrop | null = null;
    try {
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const frameId = await serverDefaultFrame(interaction.guildId);
      const effects = await activeEffects(user.id, interaction.guildId);
      const shape = dropShape(effects, frameId);
      shelved = shape ? takeDrop(shape, user.dropsSinceMint) : null;
      prepared = await prepareDrop({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        discordId: interaction.user.id,
        username: interaction.user.username,
        presetSlots: shelved?.slots ?? null,
      });
      if (shelved && !prepared.fromShelf) {
        restoreDrop(shelved);
        shelved = null;
      }
      await interaction.deferReply();
      const started = Date.now();
      const payload =
        shelved && prepared.fromShelf
          ? dropMessageFromStrip({
              dropperDiscordId: prepared.dropperDiscordId,
              slots: prepared.slots,
              strip: shelved.strip,
              animated: shelved.animated,
              elapsedMs: Date.now() - started,
            })
          : await renderDropMessage(prepared);
      await interaction.editReply(payload);
      const message = await interaction.fetchReply();
      const createdAt = await commitDrop(prepared, message.id);
      committed = true;
      shelved = null;
      void sendWishlistDropDms(
        client,
        prepared.wishlistWatchers,
        message.url,
        message.id,
        prepared.dropperDiscordId,
      );
      void queueCooldownReminder(interaction.user.id, "DROP");
      scheduleGrabNotices(client, {
        messageId: message.id,
        channelId: prepared.channelId,
        createdAt,
      });
      scheduleDropExpiry(client, {
        messageId: message.id,
        channelId: prepared.channelId,
        expiresAt: prepared.expiresAt,
      });
      const slotIcons = ["slot-1", "slot-2", "slot-3", "slot-4"] as const;
      for (const key of slotIcons.slice(0, prepared.slots.length)) {
        await message.react(icon(key));
      }
    } catch (err) {
      if (shelved) restoreDrop(shelved);
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

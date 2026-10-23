import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { refreshCardCache } from "../../game/card-cache.js";
import { HOST_DISCORD_ID } from "../host-gate.js";
import { clearDropShelf, DropShelfBusyError, pauseDropShelf, resumeDropShelf } from "../drop-shelf.js";
import { removeInitLock, tryCreateInitLock } from "../../utils/init-lock.js";
import { progressBar } from "../../utils/progress-bar.js";
import type { AkiraCommand } from "../../types/commands.js";

function finished(redrawn: number, skipped: number): string {
  if (redrawn === 0 && skipped === 0) return "Akira checked her cache. There was nothing to redraw, and she is back.";
  const drew = redrawn === 1 ? "Akira redrew 1 cached card" : `Akira redrew ${redrawn.toLocaleString("en-US")} cached cards`;
  if (skipped === 0) return `${drew} and is back.`;
  const left = skipped === 1 ? "1 stayed as it was" : `${skipped.toLocaleString("en-US")} stayed as they were`;
  return `${drew}. ${left}. She is back.`;
}

function refreshEmbed(text: string, ratio: number): EmbedBuilder {
  return new EmbedBuilder().setColor("#7c4dff").setDescription(`${progressBar(ratio)}\n${text}`);
}

async function report(interaction: ChatInputCommandInteraction, embed: EmbedBuilder): Promise<void> {
  try {
    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (err) {
    console.error("Card refresh could not edit the reply.", err);
    const channel = interaction.channel;
    if (channel && "send" in channel) await channel.send({ embeds: [embed] }).catch(() => undefined);
  }
}

function progressUpdates(interaction: ChatInputCommandInteraction) {
  let last = 0;
  let chain = Promise.resolve();
  return {
    show(done: number, total: number) {
      const now = Date.now();
      if (last !== 0 && now - last < 10_000) return;
      last = now;
      const ratio = total === 0 ? 0 : done / total;
      const text = `Akira is off while she redraws every cached card.\n${done.toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`;
      chain = chain
        .then(() => interaction.editReply({ content: null, embeds: [refreshEmbed(text, ratio)] }).then(() => undefined))
        .catch((err) => console.error("Card refresh progress did not update.", err));
    },
    drain() {
      return chain;
    },
  };
}

export const refresh: AkiraCommand = {
  hidden: true,
  data: new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Pause Akira, redraw every cached card, and bring her back"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    if (interaction.user.id !== HOST_DISCORD_ID) {
      if ("isChatInputCommand" in interaction && typeof interaction.isChatInputCommand === "function") {
        await interaction.reply({ content: "Akira doesn't recognize that command - try `/help`.", ephemeral: true }).catch(() => undefined);
      }
      return;
    }
    if (!tryCreateInitLock()) {
      await interaction.reply({ content: "Akira is already getting ready.", ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();
      await pauseDropShelf();
      clearDropShelf();
      const updates = progressUpdates(interaction);
      const result = await refreshCardCache((progress) => updates.show(progress.done, progress.total));
      await updates.drain();
      const attempted = result.redrawn + result.skipped;
      const ratio = attempted === 0 ? 0 : result.redrawn / attempted;
      await report(interaction, refreshEmbed(finished(result.redrawn, result.skipped), ratio));
    } catch (err) {
      console.error(err);
      const content = err instanceof DropShelfBusyError
        ? "Akira was still drawing a card, so she left the cache alone and came back."
        : "Akira couldn't finish redrawing her cards. She is back.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, embeds: [] }).catch(() => undefined);
      } else {
        await interaction.reply({ content }).catch(() => undefined);
      }
    } finally {
      removeInitLock();
      resumeDropShelf();
    }
  },
};

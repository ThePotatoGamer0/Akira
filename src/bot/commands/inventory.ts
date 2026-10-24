import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { formatRemaining } from "../../game/balance.js";
import { effectHome } from "../../game/buffs.js";
import { economySnapshot } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

function leftLabel(expiresAt: string): string {
  const left = formatRemaining(new Date(expiresAt).getTime() - Date.now());
  return left === "ready" ? "ending now" : `${left} left`;
}

export const inventory: AkiraCommand = {
  data: new SlashCommandBuilder().setName("inventory").setDescription("See your shop, server, and prestige buffs"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      const home = effectHome({
        shop: view.shop.length,
        server: view.server !== null,
        prestige: view.prestige.length,
      });
      const lines: string[] = [`<@${interaction.user.id}>`];
      if (view.shop.length > 0) {
        lines.push("", "**Shop**");
        for (const row of view.shop) {
          const series = row.seriesName ? ` (${row.seriesName})` : "";
          lines.push(`**${row.name}**${series} · ${leftLabel(row.expiresAt)}`);
        }
        if (home === "shop") lines.push(...view.combined);
      }
      if (view.server) {
        lines.push("", "**Server**");
        const left = leftLabel(view.server.expiresAt);
        for (const name of view.server.names) lines.push(`**${name}** · ${left}`);
        if (home === "server") lines.push(...view.combined);
      }
      if (view.prestige.length > 0) {
        lines.push("", "**Prestige**");
        for (const row of view.prestige) lines.push(row.line);
      }
      if (home === "together" && view.combined.length > 0) {
        lines.push("", "**Together**");
        lines.push(...view.combined);
      }
      if (lines.length === 1) lines.push("", "No buffs are on you right now.");
      const embed = new EmbedBuilder()
        .setTitle("Inventory")
        .setColor("#2b2d31")
        .setDescription(lines.join("\n"));
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

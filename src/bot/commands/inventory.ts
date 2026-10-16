import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { formatRemaining } from "../../game/balance.js";
import { effectHome } from "../../game/buffs.js";
import { economySnapshot } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

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
      const lines: string[] = [];
      if (view.shop.length > 0) {
        lines.push("**Shop**");
        for (const row of view.shop) {
          const left = formatRemaining(new Date(row.expiresAt).getTime() - Date.now());
          const series = row.seriesName ? ` (${row.seriesName})` : "";
          lines.push(`${row.name}${series}: ${left} left`);
        }
        if (home === "shop") lines.push(...view.combined);
      }
      if (view.server) {
        lines.push("**Server**");
        const left = formatRemaining(new Date(view.server.expiresAt).getTime() - Date.now());
        lines.push(`${view.server.names.join(", ")}: ${left} left`);
        if (home === "server") lines.push(...view.combined);
      }
      if (view.prestige.length > 0) {
        lines.push("**Prestige**");
        for (const row of view.prestige) lines.push(row.line);
      }
      if (home === "together" && view.combined.length > 0) {
        lines.push("**Together**");
        lines.push(...view.combined);
      }
      await interaction.reply({
        content: lines.length > 0 ? lines.join("\n") : "No buffs are on you right now.",
        ephemeral: true,
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

import { SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";
import type { AkiraCommand } from "../../types/commands.js";
import { prisma } from "../../db/client.js";
import { akiraAddressName } from "../../utils/akira-address-name.js";
import { syncDiscordUsernameForWebUi } from "../sync-webui-username.js";

export const ping: AkiraCommand = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check if Akira is here"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    await syncDiscordUsernameForWebUi(interaction.user.id, interaction.user.username);
    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
    const name = akiraAddressName(user ?? { discordUsername: interaction.user.username });
    await interaction.reply({ content: `Akira's here, ${name}! Pong.`, ephemeral: true });
  },
};

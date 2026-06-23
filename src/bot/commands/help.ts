import { SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";
import type { AkiraCommand } from "../../types/commands.js";
import { prisma } from "../../db/client.js";
import { akiraAddressName } from "../../utils/akira-address-name.js";
import { syncDiscordUsernameForWebUi } from "../sync-webui-username.js";

export const help: AkiraCommand = {
  data: new SlashCommandBuilder().setName("help").setDescription("What Akira can do (overview)"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    await syncDiscordUsernameForWebUi(interaction.user.id, interaction.user.username);
    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
    const name = akiraAddressName(user ?? { discordUsername: interaction.user.username });
    await interaction.reply({
      content:
        `**${name}** — Akira collects cards with you — drops, grabs, burning for bits, dailies, and more. ` +
        "Try `/ping` and watch this space as the rest of the commands come online! " +
        "Running `/ping` or `/help` also saves your Discord name so the browser WebUI can find you.",
      ephemeral: true,
    });
  },
};

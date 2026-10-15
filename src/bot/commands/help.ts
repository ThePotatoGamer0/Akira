import { SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";
import type { AkiraCommand } from "../../types/commands.js";
import { prisma } from "../../db/client.js";
import { akiraAddressName } from "../../utils/akira-address-name.js";
import { icon } from "../../utils/icons.js";
import { commandPrefix } from "../prefix.js";
import { syncDiscordUsernameForWebUi } from "../sync-webui-username.js";

export const help: AkiraCommand = {
  data: new SlashCommandBuilder().setName("help").setDescription("What Akira can do (overview)"),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    await syncDiscordUsernameForWebUi(interaction.user.id, interaction.user.username);
    const user = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
    const name = akiraAddressName(user ?? { discordUsername: interaction.user.username });
    await interaction.reply({
      content:
        `**${name}** - Akira collects cards with you. ` +
        `Use \`/drop\` or \`${commandPrefix()}d\` in the drop channel, react with ${icon("slot-1")} ${icon("slot-2")} ${icon("slot-3")} to grab, then \`${commandPrefix()}c\`, \`${commandPrefix()}v\`, \`${commandPrefix()}b\`, and \`/daily\`. ` +
        `Lookup is \`${commandPrefix()}lu\`, cooldowns are \`${commandPrefix()}cd\`, wishlist is \`${commandPrefix()}wl\`, and frames are \`${commandPrefix()}frame\`. ` +
        `Bits go to \`/shop\`, \`/pool\`, \`/milestone\`, and \`/prestige\`. ` +
        "`/wishlist add` pings you when a character appears. " +
        "Running `/ping` or `/help` also saves your Discord name so the browser WebUI can find you.",
      ephemeral: true,
    });
  },
};

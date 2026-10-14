import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { burnOwnedCard } from "../../game/economy.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

export const burn: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("burn")
    .setDescription("Destroy a card you own for bits")
    .addStringOption((option) =>
      option.setName("card_id").setDescription("The card id to burn").setRequired(true),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const cardId = interaction.options.getString("card_id", true);
    try {
      await interaction.deferReply();
      const result = await burnOwnedCard(interaction.user.id, interaction.user.username, cardId, interaction.guildId);
      const file = new AttachmentBuilder(result.imagePath, { name: "burn.apng" });
      await interaction.editReply({
        content: `Akira burned **${result.characterName}** #${result.printNumber} and tucked ${result.awarded} bits away. You now have ${result.balance}.`,
        files: [file],
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

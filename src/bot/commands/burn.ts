import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Message,
} from "discord.js";
import { getCard, lastGrabbedCard } from "../../game/cards.js";
import { processingTimeNote } from "../../game/display.js";
import { burnOwnedCard, quoteOwnedBurn } from "../../game/economy.js";
import { GameError } from "../../game/errors.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

const CONFIRM_MS = 2 * 60 * 1000;

type PendingBurn = {
  userId: string;
  cardId: string;
  guildId: string | null;
  expires: number;
};

const pendingBurns = new Map<string, PendingBurn>();

/** `ab` or `kb` with no code asks before burning the last grabbed card. */
export async function offerLastGrabBurn(message: Message): Promise<void> {
  const cardId = await lastGrabbedCard(message.author.id);
  if (!cardId) {
    await message.reply("Akira doesn't remember a card you just grabbed.");
    return;
  }
  const card = await getCard(cardId);
  if (!card?.owner || card.owner.discordId !== message.author.id) {
    await message.reply("That card isn't in your collection anymore.");
    return;
  }
  const quote = await quoteOwnedBurn(message.author.id, message.author.username, [cardId], message.guildId);
  if (quote.burning.length === 0) {
    await message.reply("That card is in a trade, so Akira left it alone.");
    return;
  }
  const token = randomBytes(4).toString("hex");
  pendingBurns.set(token, {
    userId: message.author.id,
    cardId,
    guildId: message.guildId,
    expires: Date.now() + CONFIRM_MS,
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`kburn:yes:${token}`).setLabel("Yes").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`kburn:no:${token}`).setLabel("No").setStyle(ButtonStyle.Secondary),
  );
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#2b2d31")
        .setTitle("Are you sure?")
        .setDescription(
          `Burn **${card.variant.character.name}** #${card.printNumber} (\`${card.id}\`) for **${quote.awarded}** bits?`,
        ),
    ],
    components: [row],
  });
}

export async function handleBurnConfirmButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("kburn:")) return false;
  const [, choice, token] = interaction.customId.split(":");
  const pending = token ? pendingBurns.get(token) : undefined;
  if (!pending || pending.expires < Date.now()) {
    pendingBurns.delete(token ?? "");
    await interaction.reply({ content: "That confirmation expired.", ephemeral: true });
    return true;
  }
  if (interaction.user.id !== pending.userId) {
    await interaction.reply({ content: "Only the person who asked can answer that.", ephemeral: true });
    return true;
  }
  pendingBurns.delete(token ?? "");
  if (choice !== "yes") {
    await interaction.update({ content: "Akira left the card where it is.", embeds: [], components: [] });
    return true;
  }
  try {
    await interaction.deferUpdate();
    const started = Date.now();
    const result = await burnOwnedCard(pending.userId, interaction.user.username, pending.cardId, pending.guildId);
    const file = new AttachmentBuilder(result.imagePath, { name: "burn.gif" });
    await interaction.editReply({
      content: `Akira burned **${result.characterName}** #${result.printNumber} and tucked ${result.awarded} bits away. You now have ${result.balance}.\n${processingTimeNote(Date.now() - started)}`,
      embeds: [],
      components: [],
      files: [file],
    });
  } catch (err) {
    const text = err instanceof GameError ? err.message : "Akira tripped over something. Mind trying again in a moment?";
    await interaction.editReply({ content: text, embeds: [], components: [] }).catch(() => undefined);
  }
  return true;
}

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
      const started = Date.now();
      const result = await burnOwnedCard(interaction.user.id, interaction.user.username, cardId, interaction.guildId);
      const file = new AttachmentBuilder(result.imagePath, { name: "burn.gif" });
      await interaction.editReply({
        content: `Akira burned **${result.characterName}** #${result.printNumber} and tucked ${result.awarded} bits away. You now have ${result.balance}.\n${processingTimeNote(Date.now() - started)}`,
        files: [file],
      });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

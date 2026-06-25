import { SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";
import type { AkiraCommand } from "../../types/commands.js";
import { stub } from "../voice.js";
import { prisma } from "../../db/client.js";
import { buildCardMessage } from "../card-embed.js";

export const drop = simple("drop", "Drop cards in the configured channel", "drops");
export const grab = simple("grab", "React on a drop to claim (via number emoji)", "grab reactions");
export const collection = simple("collection", "Browse cards you own", "collection view");

export const view: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("view")
    .setDescription("Inspect a specific card you own")
    .addStringOption((option) =>
      option
        .setName("card_id")
        .setDescription("The unique instance ID of your card")
        .setRequired(true)
    ) as unknown as SlashCommandBuilder, // Cast bypasses the builder option restriction
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const cardId = interaction.options.getString("card_id", true);

    // Fetch card instance, its owner, its template variation, and the parent character/series details
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        owner: true, // Pull in the User relation so we can access their discordId
        variant: {
          include: {
            character: {
              include: { series: true },
            },
          },
        },
      },
    });

    if (!card) {
      await interaction.reply({
        content: `Akira couldn't find a card with the ID \`${cardId}\`. Double-check your spelling!`,
        ephemeral: true,
      });
      return;
    }

    const { variant, quality, printNumber, dye, owner, frameId } = card;
    const { character } = variant;
    const { series } = character;

    try {
      const messagePayload = buildCardMessage(
        card.id,
        owner?.discordId ?? null, // Extract the exact Discord ID for the ping
        quality,
        printNumber,
        frameId,
        dye,
        series.slug,
        series.name,
        character.slug,
        character.name,
        character.gender,
        character.description,
        character.aliases,
        variant.id,
        variant.name
      );
      
      await interaction.reply(messagePayload);
    } catch (err: any) {
      if (err.message === "IMAGE_MISSING") {
        await interaction.reply({
          content: "Akira knows the card exists, but the image asset is missing on disk. Please run the asset generator!",
          ephemeral: true,
        });
      } else {
        console.error(err);
        await interaction.reply({
          content: "An unexpected error occurred while loading the card.",
          ephemeral: true,
        });
      }
    }
  },
};

export const burn = simple("burn", "Destroy a card for bits (shows burn.apng)", "burn");
export const multiburn = simple("multiburn", "Burn many cards with filters", "multiburn");
export const daily = simple("daily", "Claim your daily bits", "daily rewards");
export const cooldowns = simple("cooldowns", "See grab and drop timers", "cooldowns");
export const lookup = simple("lookup", "Search characters in the card pool", "lookup");
export const reminders = simple("reminders", "DM reminders when cooldowns expire", "reminders");
export const importCsv = simple("import", "Import cards from a Karuta k!spreadsheet CSV", "CSV import");

function simple(name: string, description: string, feature: string): AkiraCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description),
    execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
      await interaction.reply({ content: stub(feature), ephemeral: true });
    },
  };
}
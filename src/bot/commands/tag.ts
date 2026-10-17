import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { lastGrabbedCard } from "../../game/cards.js";
import { cardSummaryLine } from "../../game/display.js";
import { GameError } from "../../game/errors.js";
import { displayFrameId, personalDefaultFrame, serverDefaultFrame } from "../../game/frames.js";
import { applyTag, clearTag, createTag, deleteTag, listTags } from "../../game/tags.js";
import { icon } from "../../utils/icons.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";

function cardIdsFrom(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(/[\s,]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}

export const taglist: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("taglist")
    .setDescription("See someone's tags")
    .addUserOption((option) => option.setName("user").setDescription("Whose tags to look at")),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    const target = interaction.options.getUser("user") ?? interaction.user;
    try {
      const { tags, untagged } = await listTags(target.id);
      const lines = [
        `${icon("square")} **untagged** · ${untagged}`,
        ...tags.map((tag) => `${tag.emoji} **${tag.name}** · ${tag.count}`),
      ];
      const embed = new EmbedBuilder()
        .setTitle("Tag List")
        .setColor("#2b2d31")
        .setDescription(`<@${target.id}>\n\n${lines.join("\n")}`);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export const tagcreate: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("tagcreate")
    .setDescription("Create a tag with an emoji")
    .addStringOption((option) => option.setName("tag_name").setDescription("A short name").setRequired(true))
    .addStringOption((option) =>
      option.setName("emoji").setDescription("Shown on the left of a tagged card").setRequired(true),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const tag = await createTag(
        interaction.user.id,
        interaction.user.username,
        interaction.options.getString("tag_name", true),
        interaction.options.getString("emoji", true),
      );
      await interaction.reply({ content: `Created ${tag.emoji} **${tag.name}**.` });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export const tagdelete: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("tagdelete")
    .setDescription("Delete one of your tags")
    .addStringOption((option) => option.setName("tag_name").setDescription("The tag").setRequired(true)),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const tag = await deleteTag(
        interaction.user.id,
        interaction.user.username,
        interaction.options.getString("tag_name", true),
      );
      await interaction.reply({ content: `Deleted ${tag.emoji} **${tag.name}**. Cards that had it are untagged.` });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export const tag: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Put one of your tags on cards")
    .addStringOption((option) => option.setName("tag_name").setDescription("The tag").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("card_ids")
        .setDescription("Card codes, separated by spaces. Leave this out to tag the last card you grabbed"),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      let ids = cardIdsFrom(interaction.options.getString("card_ids"));
      if (ids.length === 0) {
        const last = await lastGrabbedCard(interaction.user.id);
        if (!last) throw new GameError("grab", "Akira doesn't remember a card you just grabbed.");
        ids = [last];
      }
      const result = await applyTag(interaction.user.id, interaction.user.username, interaction.options.getString("tag_name", true), ids);
      const lines = result.cards.map(
        (card) => `added tag '${result.tag.name}' ${result.tag.emoji} to card \`${card.id}\` **${card.variant.character.name}**.`,
      );
      await interaction.reply({ content: lines.join("\n") });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export const untag: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("untag")
    .setDescription("Take the tag off cards you own")
    .addStringOption((option) =>
      option
        .setName("card_ids")
        .setDescription("Card codes, separated by spaces. Leave this out to untag the last card you grabbed"),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      let ids = cardIdsFrom(interaction.options.getString("card_ids"));
      if (ids.length === 0) {
        const last = await lastGrabbedCard(interaction.user.id);
        if (!last) throw new GameError("grab", "Akira doesn't remember a card you just grabbed.");
        ids = [last];
      }
      const cards = await clearTag(interaction.user.id, interaction.user.username, ids);
      const serverFrame = await serverDefaultFrame(interaction.guildId);
      const personalFrame = await personalDefaultFrame(interaction.user.id);
      const lines = cards.map((card) =>
        cardSummaryLine({
          cardId: card.id,
          quality: card.quality,
          printNumber: card.printNumber,
          frameId: displayFrameId(card.frameId, serverFrame, personalFrame),
          seriesName: card.variant.character.series.name,
          characterName: card.variant.character.name,
          tagEmoji: icon("square"),
        }),
      );
      await interaction.reply({ content: lines.join("\n") });
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

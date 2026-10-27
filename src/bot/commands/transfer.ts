import fs from "node:fs/promises";
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
} from "discord.js";
import type { Quality } from "../../game/balance.js";
import { cardSummaryLine } from "../../game/display.js";
import { emojiForTag, tagEmojisForDiscord } from "../../game/tags.js";
import { ensureCardImage, visualKind } from "../../game/compose.js";
import { displayFrameId, personalDefaultFrame, serverDefaultFrame } from "../../game/frames.js";
import { GameError } from "../../game/errors.js";
import { icon } from "../../utils/icons.js";
import {
  acceptTransfer,
  cancelTransfer,
  claimExpiry,
  offerSide,
  proposeGive,
  proposeTrade,
  type TransferCard,
  type TransferView,
} from "../../game/transfer.js";
import { renderTradePair } from "../../renderer/trade-strip.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";
import { sendWishlistReceipt } from "../wishlist-dm.js";

async function line(card: TransferCard | null, serverFrame: number, discordId: string | null, personalFrame: number | null): Promise<string> {
  if (!card) return "That card is gone.";
  const tags = discordId ? await tagEmojisForDiscord(discordId) : new Map<string, string>();
  return cardSummaryLine({
    cardId: card.id,
    quality: card.quality,
    printNumber: card.printNumber,
    frameId: displayFrameId(card.frameId, serverFrame, personalFrame),
    seriesName: card.seriesName,
    characterName: card.characterName,
    tagEmoji: emojiForTag(tags, card.tag),
  });
}

function banner(view: TransferView): string {
  if (view.status === "done") return "\n\n**Complete.**";
  if (view.status === "expired") return "\n\n**This offer expired.**";
  if (view.status === "cancelled" && view.changed) return "\n\n**Cancelled.** That card changed hands.";
  if (view.status === "cancelled") return "\n\n**Cancelled.**";
  if (view.fromConfirmed && !view.toConfirmed) return `\n\nWaiting on <@${view.toDiscordId}>.`;
  if (view.toConfirmed && !view.fromConfirmed) return `\n\nWaiting on <@${view.fromDiscordId}>.`;
  return "";
}

function isShiny(card: TransferCard | null): boolean {
  if (!card) return false;
  return visualKind(card.quality as Quality, card.dye) === "shiny";
}

function attachmentName(view: TransferView): string {
  const shiny = isShiny(view.fromCard) || isShiny(view.toCard);
  if (view.kind === "trade") return shiny ? "trade.gif" : "trade.png";
  return shiny ? "card.gif" : "card.png";
}

function transferButtons(view: TransferView) {
  if (view.status !== "pending") return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`xfer:no:${view.id}`).setEmoji(icon("x")).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`xfer:yes:${view.id}`).setEmoji(icon("check")).setStyle(ButtonStyle.Success),
    ),
  ];
}

async function transferMessage(
  view: TransferView,
  guildId: string | null,
  file?: { data: Buffer; name: string },
) {
  const serverFrame = await serverDefaultFrame(guildId);
  const fromFrame = await personalDefaultFrame(view.fromDiscordId);
  const toFrame = view.kind === "trade" ? await personalDefaultFrame(view.toDiscordId) : null;
  const body = view.kind === "trade"
    ? `<@${view.fromDiscordId}>\n${await line(view.fromCard, serverFrame, view.fromDiscordId, fromFrame)}\n\n<@${view.toDiscordId}>\n${await line(view.toCard, serverFrame, view.toDiscordId, toFrame)}`
    : `<@${view.fromDiscordId}> → <@${view.toDiscordId}>\n\n${await line(view.fromCard, serverFrame, view.fromDiscordId, fromFrame)}`;
  const name = file?.name ?? attachmentName(view);
  const embed = new EmbedBuilder()
    .setTitle(view.kind === "trade" ? "Card Trade" : "Card Transfer")
    .setColor("#2b2d31")
    .setDescription(body + banner(view))
    .setImage(`attachment://${name}`);
  const payload: {
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
    files?: AttachmentBuilder[];
  } = {
    embeds: [embed],
    components: transferButtons(view),
  };
  if (file) payload.files = [new AttachmentBuilder(file.data, { name: file.name })];
  return payload;
}

async function readCard(card: TransferCard, frameId: number): Promise<{ data: Buffer; animated: boolean }> {
  const kind = visualKind(card.quality as Quality, card.dye);
  const imagePath = await ensureCardImage({
    variantId: card.variantId,
    seriesSlug: card.seriesSlug,
    characterSlug: card.characterSlug,
    imageFile: card.imageFile,
    characterName: card.characterName,
    seriesName: card.seriesName,
    frameId,
    printNumber: card.printNumber,
    dye: card.dye,
    kind,
  });
  return { data: await fs.readFile(imagePath), animated: kind === "shiny" };
}

async function replyOffer(interaction: ChatInputCommandInteraction, view: TransferView): Promise<void> {
  const serverFrame = await serverDefaultFrame(interaction.guildId);
  const fromFrame = await personalDefaultFrame(view.fromDiscordId);
  const toFrame = await personalDefaultFrame(view.toDiscordId);
  if (view.kind === "trade") {
    if (!view.fromCard || !view.toCard) throw new GameError("missing", "Akira couldn't find that card anymore.");
    const [left, right] = await Promise.all([
      readCard(view.fromCard, displayFrameId(view.fromCard.frameId, serverFrame, fromFrame)),
      readCard(view.toCard, displayFrameId(view.toCard.frameId, serverFrame, toFrame)),
    ]);
    const pair = await renderTradePair(left.data, right.data, left.animated || right.animated);
    const file = { data: pair.data, name: pair.animated ? "trade.gif" : "trade.png" };
    await interaction.reply(await transferMessage(view, interaction.guildId, file));
    return;
  }
  if (!view.fromCard) throw new GameError("missing", "Akira couldn't find that card anymore.");
  const image = await readCard(view.fromCard, displayFrameId(view.fromCard.frameId, serverFrame, fromFrame));
  const file = { data: image.data, name: image.animated ? "card.gif" : "card.png" };
  await interaction.reply(await transferMessage(view, interaction.guildId, file));
}

function recipientOf(interaction: ChatInputCommandInteraction) {
  const recipient = interaction.options.getUser("user", true);
  if (!recipient || recipient.bot) throw new GameError("bot", "Akira can't hand a card to a bot.");
  return recipient;
}

export const give: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Offer one of your cards to another player")
    .addUserOption((option) => option.setName("user").setDescription("Who receives the card").setRequired(true))
    .addStringOption((option) =>
      option.setName("card_id").setDescription("The card you are giving").setRequired(true),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const recipient = recipientOf(interaction);
      const view = await proposeGive({
        fromDiscordId: interaction.user.id,
        fromUsername: interaction.user.username,
        toDiscordId: recipient.id,
        toUsername: recipient.username,
        cardId: interaction.options.getString("card_id", true),
      });
      await replyOffer(interaction, view);
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export const trade: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Offer one of your cards for one of theirs")
    .addStringOption((option) =>
      option.setName("card_id").setDescription("Your card").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("their_card").setDescription("Their card").setRequired(true),
    )
    .addUserOption((option) =>
      option.setName("user").setDescription("Who you are trading with, if you want to ping them").setRequired(false),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      const view = await proposeTrade({
        fromDiscordId: interaction.user.id,
        fromUsername: interaction.user.username,
        cardId: interaction.options.getString("card_id", true),
        theirCardId: interaction.options.getString("their_card", true),
      });
      await replyOffer(interaction, view);
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleTransferButton(interaction: ButtonInteraction): Promise<boolean> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "xfer" || !parts[1]) return false;
  try {
    if (parts[1] === "q") {
      const side = parts[2];
      const offerId = parts[3];
      if ((side !== "from" && side !== "to") || !offerId) return false;
      const expired = await claimExpiry(offerId);
      if (expired) {
        await interaction.update(await transferMessage(expired, interaction.guildId));
        return true;
      }
      const view = await offerSide(offerId, interaction.user.id);
      const serverFrame = await serverDefaultFrame(interaction.guildId);
      const card = side === "from" ? view.fromCard : view.toCard;
      const ownerId = side === "from" ? view.fromDiscordId : view.toDiscordId;
      await interaction.reply({
        content: await line(card, serverFrame, ownerId, await personalDefaultFrame(ownerId)),
        ephemeral: true,
      });
      return true;
    }
    const offerId = parts[2];
    if (!offerId || (parts[1] !== "yes" && parts[1] !== "no")) return false;
    const expired = await claimExpiry(offerId);
    const view = expired
      ?? (parts[1] === "no"
        ? await cancelTransfer(offerId, interaction.user.id)
        : await acceptTransfer(offerId, interaction.user.id));
    await interaction.update(await transferMessage(view, interaction.guildId));
    if (!expired && parts[1] === "yes" && view.status === "done" && view.wishlistCleared.length > 0) {
      void sendWishlistReceipt(interaction.client, view.toDiscordId, view.wishlistCleared);
    }
    return true;
  } catch (err) {
    const content = err instanceof GameError
      ? err.message
      : "Akira tripped over something. Mind trying again in a moment?";
    if (!(err instanceof GameError)) console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return true;
  }
}

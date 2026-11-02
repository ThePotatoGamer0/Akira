import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Message,
} from "discord.js";
import { prisma } from "../../db/client.js";
import { TRADE_DAILY_PAIR_VALUE } from "../../game/balance.js";
import { GameError } from "../../game/errors.js";
import {
  addToMultitrade,
  agreeMultitrade,
  attachMultitradeMessage,
  cancelMultitrade,
  forceMultitrade,
  lockMultitrade,
  proposeMultitrade,
  releaseGift,
  viewMultitrade,
  type MultitradeSide,
  type MultitradeView,
} from "../../game/multitrade.js";
import { parseTradeOffer } from "../../game/multitrade-text.js";
import type { AkiraCommand } from "../../types/commands.js";
import { sendGameError } from "../reply.js";
import { sendWishlistReceipt } from "../wishlist-dm.js";

const EMBED = "#2b2d31";

/** DM each side about the characters they no longer need to watch. */
export async function sendTradeReceipts(
  client: Client,
  view: { wishlistCleared: Array<{ discordId: string; names: string[] }> },
): Promise<void> {
  await Promise.all(
    view.wishlistCleared.map((row) => sendWishlistReceipt(client, row.discordId, row.names)),
  );
}

function codeBlock(lines: string[]): string {
  const body = lines.length > 0 ? lines.map((line) => line.replaceAll("`", "'")).join("\n") : " ";
  return `\`\`\`\n${body}\n\`\`\``;
}

function sideLines(side: MultitradeSide): string[] {
  return [
    ...side.cards.map((card) => `${card.id} · ${card.characterName}`),
    ...(side.bits > 0 ? [`${side.bits} bits`] : []),
  ];
}

function sideEmbed(side: MultitradeSide): EmbedBuilder {
  const lines = sideLines(side);
  const footer = side.locked ? "Locked in" : lines.length > 0 ? "Not locked" : "Send a card code or 100 bits";
  return new EmbedBuilder()
    .setTitle(side.username)
    .setColor(EMBED)
    .setDescription(codeBlock(lines))
    .setFooter({ text: footer });
}

/** A gift: everything offered sits on one side, so nothing is asked back. */
function isGift(view: MultitradeView): boolean {
  const offered = (side: MultitradeSide) => side.cards.length > 0 || side.bits > 0;
  return offered(view.from) !== offered(view.to);
}

function buttons(view: MultitradeView): ActionRowBuilder<ButtonBuilder>[] {
  if (view.status === "request") {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`mtrade:cancel:${view.id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`mtrade:agree:${view.id}`).setLabel("Agree").setStyle(ButtonStyle.Success),
      ),
    ];
  }
  if (view.status !== "open") return [];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mtrade:cancel:${view.id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mtrade:lock:${view.id}`).setLabel("Lock").setStyle(ButtonStyle.Primary),
  );
  if (!isGift(view) && view.fairness.level === "block") {
    row.addComponents(
      new ButtonBuilder().setCustomId(`mtrade:force:${view.id}`).setLabel("Allow anyway").setStyle(ButtonStyle.Secondary),
    );
  }
  return [row];
}

/** Only an admin can wave a blocked deal through. */
async function isAdmin(interaction: ButtonInteraction): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
    select: { isAdmin: true },
  });
  return user?.isAdmin === true;
}

function multitradePayload(view: MultitradeView): {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  if (view.status === "request") {
    return {
      content: "",
      embeds: [
        new EmbedBuilder()
          .setTitle("Multitrade")
          .setColor(EMBED)
          .setDescription(
            `<@${view.from.discordId}> wants to trade with <@${view.to.discordId}>.\n\n<@${view.to.discordId}>, press **Agree** to open it.`,
          ),
      ],
      components: buttons(view),
    };
  }
  const embeds = [sideEmbed(view.from), sideEmbed(view.to)];
  if (view.status === "open") {
    const remaining = `Today with this player: ${view.fairness.remaining} of ${TRADE_DAILY_PAIR_VALUE} points left.`;
    const note = view.fairness.note;
    // A gift reads as a normal offer; only two-sided trades carry the warning.
    const footer = isGift(view) ? remaining : note ? `${note} ${remaining}` : remaining;
    embeds[embeds.length - 1]!.setFooter({ text: footer });
    const blocked = !isGift(view) && view.fairness.level === "block";
    return {
      content: blocked
        ? "**One side is far more than the other.** Locking will cancel this. An admin can press **Allow anyway**."
        : "Offer cards and bits in this channel. Both of you press Lock when it looks right.",
      embeds,
      components: buttons(view),
    };
  }
  const content = view.status === "done"
    ? "**Complete.**"
    : view.status === "expired"
      ? "**This trade expired.**"
      : `**Cancelled.**${view.closeReason ? ` ${view.closeReason}` : ""}`;
  // Both players can wave a gift past the pair budget; only an admin can wave a lopsided deal through.
  const reason = view.closeReason ?? "";
  const giftBlocked = view.status === "cancelled" && isGift(view) && reason.includes("budget");
  const lopsided = view.status === "cancelled" && !isGift(view) && reason.includes("lopsided");
  if (giftBlocked) {
    return {
      content: `${content}\nA gift can still go through: press **Release**.`,
      embeds,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`mtrade:release:${view.id}`).setLabel("Release").setStyle(ButtonStyle.Success),
      )],
    };
  }
  return {
    content,
    embeds,
    components: lopsided ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`mtrade:force:${view.id}`).setLabel("Allow anyway").setStyle(ButtonStyle.Secondary),
    )] : [],
  };
}

async function editTradeMessage(client: Client, view: MultitradeView): Promise<void> {
  if (!view.messageId) return;
  const channel = await client.channels.fetch(view.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) return;
  const tradeMessage = await channel.messages.fetch(view.messageId).catch(() => null);
  if (!tradeMessage) return;
  await tradeMessage.edit(multitradePayload(view));
}

export const multitrade: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("multitrade")
    .setDescription("Trade several cards and bits with another player")
    .addUserOption((option) => option.setName("user").setDescription("Who you are trading with").setRequired(true)),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    try {
      if (!interaction.guildId || !interaction.channelId) {
        await interaction.reply({ content: "Run this in a server channel." });
        return;
      }
      const recipient = interaction.options.getUser("user", true);
      if (!recipient || recipient.bot) throw new GameError("bot", "Akira can't trade with a bot.");
      const view = await proposeMultitrade({
        fromDiscordId: interaction.user.id,
        fromUsername: interaction.user.username,
        toDiscordId: recipient.id,
        toUsername: recipient.username,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });
      const sent = await interaction.reply({ ...multitradePayload(view), fetchReply: true });
      await attachMultitradeMessage(view.id, sent.id);
    } catch (err) {
      await sendGameError(interaction, err);
    }
  },
};

export async function handleMultitradeButton(interaction: ButtonInteraction): Promise<boolean> {
  const [scope, action, id] = interaction.customId.split(":");
  if (scope !== "mtrade" || !action || !id) return false;
  if (action !== "agree" && action !== "cancel" && action !== "lock" && action !== "force" && action !== "release") return false;
  if (action === "force" && !(await isAdmin(interaction))) {
    await interaction.reply({ content: "Only an admin can let this through.", ephemeral: true });
    return true;
  }
  try {
    if (action === "force") {
      const trade = await prisma.multitrade.findUnique({ where: { id }, select: { fromUserId: true } });
      if (!trade) throw new GameError("closed", "This trade is no longer open.");
      await forceMultitrade(id);
      await lockMultitrade(id, interaction.user.id);
      await interaction.update(multitradePayload(await viewMultitrade(id)));
      return true;
    }
    if (action === "release") {
      await releaseGift(id, interaction.user.id);
      await interaction.update(multitradePayload(await viewMultitrade(id)));
      return true;
    }
    const view = action === "agree"
      ? await agreeMultitrade(id, interaction.user.id)
      : action === "cancel"
        ? await cancelMultitrade(id, interaction.user.id)
        : await lockMultitrade(id, interaction.user.id);
    await interaction.update(multitradePayload(view));
    // A lock can be the move that completes the deal, so receipts are not only for Agree.
    if (view.status === "done") void sendTradeReceipts(interaction.client, view);
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

export async function handleMultitradeMessage(message: Message, client: Client): Promise<void> {
  if (!message.guildId) return;
  const parsed = parseTradeOffer(message.content);
  if (!parsed) return;
  try {
    const result = await addToMultitrade(message.author.id, message.channelId, parsed);
    if (!result) return;
    await editTradeMessage(client, result.view);
    if (result.view.status === "expired") {
      await message.reply("This trade expired.");
      return;
    }
    if (result.waiting) {
      await message.reply("Wait until the other player agrees.");
      return;
    }
    const notes: string[] = [];
    if (result.duplicates.length > 0) {
      notes.push(`${result.duplicates.map((cardId) => `\`${cardId}\``).join(", ")} already in the trade.`);
    }
    if (parsed.unknown.length > 0) {
      const skipped = parsed.unknown.map((part) => `\`${part}\``).join(", ");
      notes.push(`Akira left out ${skipped}. Offer a card code or \`100 bits\`.`);
    }
    if (notes.length > 0) await message.reply(notes.join(" "));
  } catch (err) {
    const content = err instanceof GameError
      ? err.message
      : "Akira tripped over something. Mind trying again in a moment?";
    if (!(err instanceof GameError)) console.error(err);
    await message.reply(content).catch(() => undefined);
  }
}

import {
  Events,
  type Client,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextBasedChannel,
  type User,
} from "discord.js";
import { positionFromEmoji } from "../../game/balance.js";
import { rememberGrab } from "../../game/cards.js";
import { queueBurnWarm } from "../drop-shelf.js";
import { claimReaction, loadDrop } from "../../game/drops.js";
import { GameError } from "../../game/errors.js";
import { isInitLocked } from "../../utils/init-lock.js";
import { grabNoticeText } from "../grab-notices.js";
import { hostIsInGuild, privateServerMessage } from "../host-gate.js";
import { queueCooldownReminder } from "../reminder-schedule.js";

async function tell(channel: TextBasedChannel, text: string, temporary: boolean): Promise<void> {
  if (!("send" in channel)) return;
  const notice = await channel.send(text);
  if (!temporary) return;
  setTimeout(() => {
    void notice.delete().catch(() => undefined);
  }, 8000);
}

/** Claim a drop slot the way a reaction would, without adding a reaction. */
export async function performGrab(message: Message, emojiName: string | null, user: User): Promise<"done" | "missing" | "skipped"> {
  if (user.bot || isInitLocked()) return "skipped";
  const position = positionFromEmoji(emojiName);
  if (!position) return "skipped";
  const existing = await loadDrop(message.id);
  if (!existing) return "missing";

  if (!(await hostIsInGuild(message.guild))) {
    await tell(message.channel, `<@${user.id}> ${privateServerMessage("grab")}`, true);
    return "done";
  }

  try {
    const result = await claimReaction({
      messageId: message.id,
      position,
      discordId: user.id,
      username: user.username,
    });
    void queueCooldownReminder(user.id, "GRAB");
    await rememberGrab(user.id, result.cardId);
    queueBurnWarm(result.cardId, message.guildId);
    if (result.foughtOffDiscordId) {
      void queueCooldownReminder(result.foughtOffDiscordId, "GRAB");
    }
    for (const notice of result.notices) {
      await tell(message.channel, grabNoticeText(notice), false);
    }
    return "done";
  } catch (err) {
    if (err instanceof GameError) {
      await tell(message.channel, `<@${user.id}> ${err.message}`, true);
      return "done";
    }
    throw err;
  }
}

export function registerReactionHandler(client: Client): void {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await onReaction(reaction, user);
    } catch (err) {
      console.error(err);
    }
  });
}

async function onReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot || isInitLocked()) return;
  if (!positionFromEmoji(reaction.emoji.name)) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  if (user.partial) await user.fetch();
  if (reaction.message.partial || user.partial) return;
  await performGrab(reaction.message, reaction.emoji.name, user);
}

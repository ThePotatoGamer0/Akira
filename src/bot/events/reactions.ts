import { Events, type Client, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from "discord.js";
import { positionFromEmoji } from "../../game/balance.js";
import { rememberGrab } from "../../game/cards.js";
import { grabAnnouncement } from "../../game/display.js";
import { claimReaction, loadDrop } from "../../game/drops.js";
import { GameError } from "../../game/errors.js";
import { isInitLocked } from "../../utils/init-lock.js";
import { queueCooldownReminder } from "../reminder-schedule.js";

async function tell(reaction: MessageReaction | PartialMessageReaction, text: string, temporary: boolean): Promise<void> {
  const channel = reaction.message.channel;
  if (!channel.isTextBased() || !("send" in channel)) return;
  const notice = await channel.send(text);
  if (!temporary) return;
  setTimeout(() => {
    void notice.delete().catch(() => undefined);
  }, 8000);
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
  const position = positionFromEmoji(reaction.emoji.name);
  if (!position) return;

  const existing = await loadDrop(reaction.message.id);
  if (!existing) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();
  if (user.partial) await user.fetch();

  try {
    const result = await claimReaction({
      messageId: reaction.message.id,
      position,
      discordId: user.id,
      username: "username" in user && user.username ? user.username : "",
    });
    void queueCooldownReminder(user.id, "GRAB");
    await rememberGrab(user.id, result.cardId);
    await tell(
      reaction,
      grabAnnouncement({
        discordId: user.id,
        characterName: result.characterName,
        cardId: result.cardId,
        quality: result.quality,
      }),
      false,
    );
  } catch (err) {
    if (err instanceof GameError) {
      await tell(reaction, `<@${user.id}> ${err.message}`, true);
      return;
    }
    throw err;
  }
}

import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { POOL_GOALS, buffName, poolGoal, poolTier } from "../../game/buffs.js";
import { resolveDropChannelId, setPoolChannel } from "../../game/drops.js";
import { GameError } from "../../game/errors.js";
import { economySnapshot, giveToPool } from "../../game/live-buffs.js";
import { ensureUser } from "../../game/users.js";
import type { AkiraCommand } from "../../types/commands.js";
import { pollAfterGift } from "../pool-midnight.js";
import { sendGameError } from "../reply.js";

const POLL_GOAL = POOL_GOALS.find((row) => row.kind === "poll")!.bits;

/** What tonight's roll will actually do, in one or two lines. */
export function poolOutlook(bits: number, choices: readonly string[]): string[] {
  const tier = poolTier(bits);
  const goal = poolGoal(bits);
  if (choices.length === 0) return ["Tonight: nothing is chosen until the pot reaches 10,000 bits."];
  const slots = tier >= 4 ? 2 : 1;
  const pickable = choices.filter((name) => name !== buffName("tracked_pull"));
  const lines = [
    goal >= 10_000
      ? `Tonight: always ${buffName("tracked_pull")}, plus ${slots} of ${pickable.join(", ")}.`
      : `Tonight: ${slots} of ${pickable.join(", ")}.`,
  ];
  if (goal >= 50_000) lines.push("Choose at random: none. The poll's top two are guaranteed.");
  else if (goal >= 25_000) lines.push("Choose at random: the slot the poll does not pick.");
  return lines;
}

function poolText(view: Awaited<ReturnType<typeof economySnapshot>>): string {
  const live = view.pool.live.length > 0 ? `${view.pool.live.join(", ")} until ${view.pool.buffExpiry?.replace("T", " ").slice(0, 16)} UTC` : "none";
  const carried = view.pool.carriedBits > 0 ? `${view.pool.carriedBits.toLocaleString("en-US")} of it carried from last night` : null;
  const lines = [
    `Pot: ${view.pool.totalBits.toLocaleString("en-US")} bits`,
    `Tier: ${view.pool.tier}`,
  ];
  if (carried) lines.push(`Carried: ${carried}`);
  lines.push(
    ...poolOutlook(view.pool.totalBits, view.pool.choices),
    `Live: ${live}`,
    `At ${POLL_GOAL.toLocaleString("en-US")} bits the server votes on a buff; at 50,000 it takes the top two.`,
    `Give bits with \`/pool give\`. That also fills your milestone bar.`,
  );
  return lines.join("\n");
}

export const pool: AkiraCommand = {
  data: new SlashCommandBuilder()
    .setName("pool")
    .setDescription("See the server pot or give bits toward tonight's buff")
    .addSubcommand((sub) => sub.setName("show").setDescription("See the pot, the tier, and the live buffs"))
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription("Move bits into the pot and your milestone bar")
        .addIntegerOption((option) =>
          option.setName("bits").setDescription("How many bits to give").setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Choose where the buff poll is posted (admin only)")
        .addChannelOption((option) =>
          option.setName("channel").setDescription("The poll channel. Leave it out to poll in the drop channel"),
        ),
    ),
  execute: async (interaction: ChatInputCommandInteraction, client: Client) => {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Akira only keeps a server pool inside a server.", ephemeral: true });
      return;
    }
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "channel") {
        const allowed = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
        const channel = interaction.options.getChannel("channel");
        if (!allowed) {
          await interaction.reply({ content: "Only a server admin can choose where the poll goes.", ephemeral: true });
          return;
        }
        const fallback = await resolveDropChannelId(interaction.guildId);
        await setPoolChannel(interaction.guildId, channel?.id ?? null);
        await interaction.reply({
          content: channel
            ? `The pool poll will open in <#${channel.id}>.`
            : `The pool poll will open in the drop channel${fallback ? `, <#${fallback}>` : " once one is set with `/set`"}.`,
          allowedMentions: { parse: [] },
        });
        return;
      }
      if (sub === "give") {
        const bits = interaction.options.getInteger("bits", true);
        const given = await giveToPool(interaction.user.id, interaction.user.username, interaction.guildId, bits);
        await interaction.reply({
          content: `You gave ${bits.toLocaleString("en-US")} bits. The pot is ${given.poolTotal.toLocaleString("en-US")}, and your milestone bar is at ${given.progress.toLocaleString("en-US")}.`,
        });
        await pollAfterGift(client, interaction.guildId);
        return;
      }
      const user = await ensureUser(interaction.user.id, interaction.user.username);
      const view = await economySnapshot(user.id, interaction.guildId);
      await interaction.reply({ content: poolText(view) });
    } catch (err) {
      if (err instanceof GameError) {
        await interaction.reply({ content: err.message, ephemeral: true });
        return;
      }
      await sendGameError(interaction, err);
    }
  },
};

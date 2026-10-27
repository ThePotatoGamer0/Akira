import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction, type Client, type Message } from "discord.js";
import { FARM_MAX_MS, FARM_WAIT_MS, type FarmStatus } from "../../game/card-farm.js";
import { farmAdvertisedUrls, farmCopyUrl } from "../../utils/lan-urls.js";
import { rememberEphemeralDm } from "../dm-mailbox.js";
import { HOST_DISCORD_ID } from "../host-gate.js";
import { clearDropShelf, DropShelfBusyError, pauseDropShelf, resumeDropShelf } from "../drop-shelf.js";
import { removeInitLock, tryCreateInitLock } from "../../utils/init-lock.js";
import { progressBar } from "../../utils/progress-bar.js";
import { whenIconsSynced } from "../icon-sync.js";
import type { AkiraCommand } from "../../types/commands.js";

function webuiBase(): string {
  const configured = process.env["WEBUI_INTERNAL_URL"]?.replace(/\/$/, "");
  if (configured) return configured;
  const port = process.env["WEBUI_SERVER_PORT"] ?? "3333";
  return `http://127.0.0.1:${port}`;
}

function internalHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env["AKIRA_INTERNAL_SECRET"] ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function farmRequest(method: string, path: string): Promise<Response> {
  return fetch(`${webuiBase()}${path}`, { method, headers: internalHeaders() });
}

function farmEmbed(text: string, ratio: number): EmbedBuilder {
  return new EmbedBuilder().setColor("#7c4dff").setDescription(`${progressBar(ratio)}\n${text}`);
}

function copyLine(url: string, token: string): string {
  return `\`npm run farm -- ${url} ${token}\``;
}

function inviteText(token: string, files: number): string {
  const urls = farmAdvertisedUrls();
  const primary = farmCopyUrl(urls);
  const count = files.toLocaleString("en-US");
  const lines = [
    `Akira packed ${count} cached pictures. She is waiting on the Pi.`,
    "",
    ...(urls.length > 0 ? urls : ["Akira could not see a wifi address from inside her box."]),
    `code: ${token}`,
    "",
    "In the Akira folder on this PC:",
    copyLine(primary ?? "http://PI-WIFI:3333", token),
  ];
  return lines.join("\n");
}

function publicWaitingText(files: number): string {
  const count = files.toLocaleString("en-US");
  return `Akira is off. She packed ${count} cached pictures and sent you the line for your PC.`;
}

function finished(redrawn: number, skipped: number): string {
  if (redrawn === 0 && skipped === 0) return "Akira checked her cache. There was nothing to redraw, and she is back.";
  const drew = redrawn === 1 ? "Akira brought back 1 cached card" : `Akira brought back ${redrawn.toLocaleString("en-US")} cached cards`;
  if (skipped === 0) return `${drew} from your PC and is back.`;
  const left = skipped === 1 ? "1 stayed as it was" : `${skipped.toLocaleString("en-US")} stayed as they were`;
  return `${drew} from your PC. ${left}. She is back.`;
}

async function report(interaction: ChatInputCommandInteraction, embed: EmbedBuilder): Promise<void> {
  try {
    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (err) {
    console.error("Card farm could not edit the reply.", err);
    const channel = interaction.channel;
    if (channel && "send" in channel) await channel.send({ embeds: [embed] }).catch(() => undefined);
  }
}

function progressUpdates(interaction: ChatInputCommandInteraction) {
  let last = 0;
  let chain = Promise.resolve();
  return {
    show(text: string, ratio: number) {
      const now = Date.now();
      if (last !== 0 && now - last < 10_000) return;
      last = now;
      chain = chain
        .then(() => interaction.editReply({ content: null, embeds: [farmEmbed(text, ratio)] }).then(() => undefined))
        .catch((err) => console.error("Card farm progress did not update.", err));
    },
    drain() {
      return chain;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFarm(onStatus: (view: FarmStatus) => void): Promise<FarmStatus> {
  const started = Date.now();
  for (;;) {
    const response = await farmRequest("GET", "/internal/farm/status");
    if (response.status === 404) {
      return {
        status: "cancelled",
        startedAt: started,
        totalFiles: 0,
        doneFiles: 0,
        redrawn: 0,
        skipped: 0,
        pendingJobs: 0,
        claimedJobs: 0,
      };
    }
    if (!response.ok) throw new Error(`farm status ${response.status}`);
    const view = (await response.json()) as FarmStatus;
    onStatus(view);
    if (view.status === "done" || view.status === "cancelled") return view;
    if (view.status === "waiting" && Date.now() - started > FARM_WAIT_MS) {
      await farmRequest("POST", "/internal/farm/cancel");
      return { ...view, status: "cancelled" };
    }
    if (Date.now() - started > FARM_MAX_MS) {
      await farmRequest("POST", "/internal/farm/cancel");
      return { ...view, status: "cancelled" };
    }
    await sleep(2_000);
  }
}

export const farm: AkiraCommand = {
  hidden: true,
  data: new SlashCommandBuilder()
    .setName("farm")
    .setDescription("Pause Akira and redraw the cache on your PC")
    .addStringOption((option) =>
      option.setName("action").setDescription("Write cancel to stop waiting").setRequired(false),
    ),
  execute: async (interaction: ChatInputCommandInteraction, _client: Client) => {
    if (interaction.user.id !== HOST_DISCORD_ID) {
      await interaction.reply({ content: "Akira doesn't recognize that command - try `/help`.", ephemeral: true }).catch(() => undefined);
      return;
    }

    if (interaction.options.getString("action")?.trim().toLowerCase() === "cancel") {
      await interaction.deferReply();
      const response = await farmRequest("POST", "/internal/farm/cancel");
      if (response.status === 404) {
        await interaction.editReply({ content: "Akira was not waiting for your PC." });
        return;
      }
      await interaction.editReply({ content: "Akira stopped waiting and is back." });
      return;
    }

    let locked = false;
    let startedFarm = false;
    let invite: Message | null = null;
    try {
      await interaction.deferReply();
      await whenIconsSynced();
      if (!tryCreateInitLock()) {
        await interaction.editReply({ content: "Akira is already getting ready." });
        return;
      }
      locked = true;
      await pauseDropShelf();
      clearDropShelf();

      const started = await farmRequest("POST", "/internal/farm/start");
      if (started.status === 409) {
        await interaction.editReply({ content: "Akira is already waiting for a PC. Run `afarm cancel` to start again." });
        return;
      }
      if (!started.ok) {
        throw new Error(`farm start ${started.status} ${await started.text()}`);
      }
      startedFarm = true;
      const body = (await started.json()) as { token: string; totalFiles: number; jobs: number; skipped: number };
      if (body.jobs === 0) {
        await report(interaction, farmEmbed(finished(0, body.skipped), 0));
        return;
      }

      try {
        invite = await interaction.user.send({ embeds: [farmEmbed(inviteText(body.token, body.totalFiles), 0)] });
        await rememberEphemeralDm(invite, new Date(Date.now() + FARM_MAX_MS));
      } catch (err) {
        console.error("Card farm could not DM the host.", err);
        await report(interaction, farmEmbed("Akira couldn't DM you, so she left the cache alone and is back.", 0));
        return;
      }

      const updates = progressUpdates(interaction);
      updates.show(publicWaitingText(body.totalFiles), 0);
      const view = await waitForFarm((status) => {
        const ratio = status.totalFiles === 0 ? 0 : status.doneFiles / status.totalFiles;
        if (status.status === "waiting") {
          updates.show(publicWaitingText(status.totalFiles), ratio);
          return;
        }
        updates.show(
          `Akira is off while your PC redraws the cache.\n${status.doneFiles.toLocaleString("en-US")} / ${status.totalFiles.toLocaleString("en-US")}`,
          ratio,
        );
      });
      await updates.drain();
      if (view.status === "cancelled" && view.doneFiles <= body.skipped) {
        await report(
          interaction,
          farmEmbed("Akira waited, but your PC never finished. She left the cache as it was and is back.", 0),
        );
        return;
      }
      const attempted = view.redrawn + view.skipped;
      const ratio = attempted === 0 ? 0 : view.redrawn / attempted;
      await report(interaction, farmEmbed(finished(view.redrawn, view.skipped), ratio));
    } catch (err) {
      console.error(err);
      const content = err instanceof DropShelfBusyError
        ? "Akira was still drawing a card, so she left the cache alone and came back."
        : "Akira couldn't finish the farm. She is back.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, embeds: [] }).catch(() => undefined);
      } else {
        await interaction.reply({ content }).catch(() => undefined);
      }
    } finally {
      if (startedFarm) {
        await farmRequest("POST", "/internal/farm/cancel").catch(() => undefined);
      }
      if (invite) {
        await invite.delete().catch(() => undefined);
      }
      if (locked) {
        removeInitLock();
        resumeDropShelf();
      }
    }
  },
};

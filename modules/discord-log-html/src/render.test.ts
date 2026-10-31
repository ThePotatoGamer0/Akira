import assert from "node:assert/strict";
import test from "node:test";
import { renderChatLog } from "./index.js";
import type { ChatLog } from "./types.js";

const log: ChatLog = {
  channel: { id: "1", name: "drops" },
  roles: [{ id: "10", name: "Grabbers", color: 0xff66aa, position: 3 }],
  members: [{ id: "42", display: "Mika", roles: ["10"] }],
  channels: [{ id: "99", name: "drops" }],
  messages: [
    {
      id: "m1",
      content: 'Hello <@42> and <@&10> in <#99>. **Bold** and <a:spark:123> https://cdn.example.com/card.gif\n<script>alert(1)</script>',
      timestamp: "2026-10-19T18:00:00.000Z",
      author: { id: "7", username: "akira", global_name: "Akira", bot: true, avatar: null },
      mentions: [{ id: "42", username: "mika", global_name: "Mika" }],
      attachments: [
        {
          filename: "strip.gif",
          url: "https://cdn.discordapp.com/attachments/1/strip.gif",
          proxy_url: "https://media.discordapp.net/attachments/1/strip.gif",
          content_type: "image/gif",
          width: 800,
          height: 400,
          size: 2048,
        },
      ],
      embeds: [
        {
          title: "Drop",
          description: "Three cards",
          color: 0x7c4dff,
          fields: [{ name: "Slot", value: "1", inline: true }],
          image: { url: "https://cdn.example.com/other.png" },
        },
        { type: "image", url: "https://cdn.example.com/card.gif", image: { url: "https://cdn.example.com/card.gif" } },
      ],
      reactions: [
        { count: 2, emoji: { id: null, name: "1️⃣" } },
        { count: 1, emoji: { id: "555", name: "slot", animated: false } },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: "Next", custom_id: "lookup:page:1:next:0:abc" },
            { type: 2, style: 5, label: "Rules", url: "https://example.com/rules" },
            { type: 2, style: 2, label: "Gone", custom_id: "old", disabled: true },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: "lookup:pick:1:abc",
              placeholder: "Pick a character",
              options: [{ label: "Mika", value: "mika" }],
            },
          ],
        },
      ],
    },
    {
      id: "m2",
      type: 19,
      content: "Reply with ||secret|| and `code`",
      timestamp: "2026-10-19T18:01:00.000Z",
      author: { id: "42", username: "mika", global_name: "Mika" },
      message_reference: { message_id: "m1" },
      referenced_message: {
        id: "m1",
        content: "Hello",
        author: { id: "7", username: "akira", global_name: "Akira", bot: true },
      },
    },
  ],
};

test("a channel log becomes discord-shaped html", () => {
  const html = renderChatLog(log);
  assert.match(html, /class="dlog"/);
  assert.match(html, /# drops/);
  assert.match(html, /@Mika/);
  assert.match(html, /@Grabbers/);
  assert.match(html, /#drops/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /cdn\.discordapp\.com\/emojis\/123\.gif/);
  assert.match(html, /<img class="dlog-media"[^>]+card\.gif/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /class="dlog-attachment-image"/);
  assert.match(html, /media\.discordapp\.net\/attachments\/1\/strip\.gif/);
  assert.match(html, /width=400/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /class="dlog-embed"/);
  assert.match(html, /Three cards/);
  assert.match(html, /other\.png/);
  assert.equal(html.match(/<img[^>]*card\.gif/g)?.length, 1);
  assert.match(html, /class="dlog-reaction" data-emoji-name="1️⃣"/);
  assert.match(html, /class="dlog-reaction" disabled/);
  assert.match(html, /data-custom-id="lookup:page:1:next:0:abc"/);
  assert.match(html, /data-custom-id="lookup:pick:1:abc"/);
  assert.match(html, /<option value="mika">Mika<\/option>/);
  assert.match(html, /31-20e3\.svg/);
  assert.match(html, /emojis\/555\.webp/);
  assert.match(html, /class="dlog-action"/);
  assert.match(html, /href="https:\/\/example\.com\/rules"/);
  assert.match(html, /class="dlog-reply"/);
  assert.match(html, /dlog-spoiler/);
  assert.match(html, /<code class="dlog-code">code<\/code>/);
  assert.match(html, /class="dlog-app"/);
  assert.match(html, />APP</);
  assert.doesNotMatch(html, />BOT</);
  assert.match(html, /class="dlog-view"/);
  assert.doesNotMatch(html, /dlog-media-link/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("javascript links stay text", () => {
  const html = renderChatLog({
    messages: [
      {
        id: "x",
        content: "[click](javascript:alert(1))",
        timestamp: "2026-10-19T18:00:00.000Z",
        author: { id: "1", username: "a" },
      },
    ],
  });
  assert.doesNotMatch(html, /href="javascript:/);
});

test("an empty log says the channel is quiet", () => {
  assert.match(renderChatLog({ messages: [] }), /Nothing has been said here yet/);
});

/** A message with embeds and, when given, text in front of them (Tenor posts its .mp4 link). */
function oneMessage(
  embeds: NonNullable<ChatLog["messages"]>[number]["embeds"],
  content = "",
): string {
  return renderChatLog({
    messages: [
      {
        id: "g1",
        content,
        timestamp: "2026-10-19T18:00:00.000Z",
        author: { id: "1", username: "mika" },
        embeds,
      },
    ],
  });
}

test("a tenor gif plays as a gif instead of a poster with a video under it", () => {
  const html = oneMessage([
    {
      type: "gifv",
      url: "https://tenor.com/view/cat-gif-123",
      video: {
        url: "https://media.tenor.com/abc/cat.mp4",
        proxy_url: "https://media.tenor.com/abc/cat.mp4",
        width: 498,
        height: 498,
      },
      thumbnail: { url: "https://media.tenor.com/abc/cat.png" },
    },
  ], "https://media.tenor.com/abc/cat.mp4");
  assert.match(html, /class="dlog-video dlog-embed-video" src="https:\/\/media\.tenor\.com\/[^"]+"[^>]*autoplay loop muted/);
  assert.match(html, /width="498" height="498"/);
  assert.doesNotMatch(html, /data-src="https:\/\/tenor\.com\/view/, "the Tenor page is not shown as an image");
  assert.doesNotMatch(html, /dlog-embed-image/, "the still is not shown next to the gif");
  assert.equal(html.match(/<video/g)?.length, 1, "the gif plays once, from the text link");
});

test("a klipy gif without a poster still becomes one video", () => {
  const html = oneMessage([
    {
      type: "image",
      url: "https://klipy.co/gif/abc",
      video: { url: "https://static.klipy.com/ii/abc.mp4", width: 320, height: 240 },
      image: { url: "https://static.klipy.com/ii/abc.png", width: 320, height: 240 },
    },
  ]);
  assert.equal(html.match(/<video/g)?.length, 1);
  assert.equal(html.match(/<img[^>]*klipy[^>]*\.png/g), null);
  assert.match(html, /autoplay/);
});

test("a real video keeps its picture as well", () => {
  const html = oneMessage([
    {
      title: "A clip",
      image: { url: "https://cdn.example.com/frame.jpg", width: 1280, height: 720 },
      video: { url: "https://cdn.example.com/clip.mp4", width: 640, height: 360 },
    },
  ]);
  assert.match(html, /dlog-embed-image[^>]*frame\.jpg/);
  const video = html.match(/<video[^>]*clip\.mp4[^>]*>/)?.[0] ?? "";
  assert.match(video, /class="dlog-video dlog-embed-video"/);
  assert.doesNotMatch(video, /autoplay/);
  assert.match(video, /width="640" height="360"/);
});

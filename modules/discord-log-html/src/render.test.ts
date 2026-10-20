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
          content_type: "image/gif",
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
          components: [{ type: 2, style: 1, label: "Grab" }, { type: 2, style: 5, label: "Rules", url: "https://example.com/rules" }],
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
  assert.match(html, /class="dlog-embed"/);
  assert.match(html, /Three cards/);
  assert.match(html, /other\.png/);
  assert.equal(html.match(/<img[^>]*card\.gif/g)?.length, 1);
  assert.match(html, /class="dlog-reaction"/);
  assert.match(html, /disabled/);
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

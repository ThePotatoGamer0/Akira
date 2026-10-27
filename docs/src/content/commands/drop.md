---
title: Drop
description: Place cards in the drop channel for people to grab. A normal drop is three.
command: drop
shortcuts: d
---

**/drop** puts cards in the server's drop channel. A normal drop is three cards, shown as one picture side by side. Anyone can react to claim one. A buff can make it one card or four. It never becomes five.

## Parameters

None.

## Aliases

`d`. `adrop` and `ad` both drop.

## Example usage

```
/drop
ad
```

## Tips

- An admin runs `aset` in a channel to choose it. Until then, Akira ignores commands in that server. `DISCORD_DROP_CHANNEL_ID` still counts for the server in `DISCORD_GUILD_ID`.
- The drop stays open for 2 minutes. Your next drop waits 20 minutes, or less while a drop-cooldown buff is on you. `/cooldowns` shows the wait you actually have.
- The message says how many cards are in the picture: `1 card`, `3 cards`, or `4 cards`. If a drop has a character someone is watching, Akira DMs them a link to that drop.
- [Quality over quantity](/commands/shop) makes the drop one card, and that card is a main character. [Four cards](/commands/shop) makes it four, and adds a fourth grab reaction. If both are on, the drop is one card.
- Mint odds stay where your buffs put them. After 200 of your drops in a row with no mint, the next drop turns one of its cards into a mint, picked at random, and the count starts over. A mint before that also starts the count over.
- Dropping, grabbing, the server pool, and choosing the drop channel only run in a server Akira's owner is in. Anywhere else she says you cannot do that in a private server. Collection, trades, and the other personal commands still work.
- For the first 20 seconds, if someone else takes a card, you can grab that same card and take it back. Akira waits to say who grabbed until you take a card, or until those 20 seconds end. If you take their card, she says you fought them off, and their grab is ready again. You get the card, 5 bits, and your own grab cooldown.
- Each card is a separate draw. The same character can appear more than once. Base art is equally likely. Alternate arts are rarer. Quality is rolled on its own and does not change which picture was drawn. Only a legendary is shiny.
- When the drop expires, the message gains a line that the cards can no longer be grabbed.

## See also

- [Shop](/commands/shop)
- [Grab](/commands/grab)
- [Cooldowns](/commands/cooldowns)
- [Wishlist](/commands/wishlist)
- [Command list](/commands/reference)
- [Drop channel in the WebUI](/webui/channel)

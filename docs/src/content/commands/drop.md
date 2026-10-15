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

- The channel is `DISCORD_DROP_CHANNEL_ID`, or the channel stored for that server.
- The drop stays open for 2 minutes. Your next drop waits 20 minutes, or less while a drop-cooldown buff is on you. `/cooldowns` shows the wait you actually have.
- [Quality over quantity](/commands/shop) makes the drop one card. [Four cards](/commands/shop) makes it four, and adds a fourth grab reaction. If both are on, the drop is one card.
- For the first 20 seconds, if someone else takes a card, you can grab that same card and take it back. Akira says you fought them off. They keep the grab cooldown from the attempt. You get the card, 5 bits, and your own grab cooldown.
- Each card is a separate draw. The same character can appear more than once. Base art is equally likely. Alternate arts are rarer. Quality is rolled on its own and does not change which picture was drawn. Only a legendary is shiny.
- When the drop expires, the message gains a line that the cards can no longer be grabbed.

## See also

- [Shop](/commands/shop)
- [Grab](/commands/grab)
- [Cooldowns](/commands/cooldowns)
- [Wishlist](/commands/wishlist)
- [Command list](/commands/reference)

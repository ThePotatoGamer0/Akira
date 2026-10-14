---
title: Drop
description: Place three cards in the drop channel for people to grab.
command: drop
shortcuts: d
---

**/drop** puts three cards in the server's drop channel. The message is one picture of the three cards side by side. Anyone can react to claim one.

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
- The drop stays open for 2 minutes. Your next drop waits 20 minutes.
- Each card is a separate draw. The same character can appear more than once. Base art is equally likely. Alternate arts are rarer. Quality is rolled on its own and does not change which picture was drawn. Only a legendary is shiny.
- When the drop expires, the message gains a line that the cards can no longer be grabbed.

## See also

- [Grab](/commands/grab)
- [Cooldowns](/commands/cooldowns)
- [Wishlist](/commands/wishlist)
- [Command list](/commands/reference)

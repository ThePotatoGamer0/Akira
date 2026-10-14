---
title: Drop
description: Akira will place three cards in the drop channel for your friends to react to.
command: drop
shortcuts: d
---

Akira will help with **/drop** - The channel has to be the server's drop channel. Three cards appear, and the number reaction itself claims one while your grab cooldown allows.

## Parameters

Parameters are still settling in for slash commands; check in-game `/help` for the live option list. Akira keeps descriptions short so slash autocomplete stays readable.

## Example usage

```
/drop
```

## Tips

- Drops only work in the configured channel. Set `DISCORD_DROP_CHANNEL_ID` for the guild in `DISCORD_GUILD_ID`, or ask an admin to store a channel on the guild.
- Three cards appear at once. React with 1️⃣ 2️⃣ or 3️⃣ to take that card. The drop stays open for 2 minutes, and your own drop cooldown is 20 minutes.
- Every character's base image is equally likely. Alternate arts are harder to roll. Quality, including a shiny legendary, is rolled separately and does not change the picture.

## See also

- [Grab](/commands/grab) - claim a card from a live drop
- [Cooldowns](/commands/cooldowns) - when you can drop or grab again
- [Wishlist](/commands/wishlist) - get pinged when a character you want appears in a drop

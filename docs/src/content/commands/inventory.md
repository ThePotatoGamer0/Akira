---
title: Inventory
description: Every buff on you, with the effect written under the source that caused it.
command: inventory
shortcuts: i, inv, items
---

**/inventory** lists every buff on you. Shop, server, and prestige are separate. A source with nothing is left out. The effect sentence sits under the one source that caused it. **Together** appears only when more than one source is on, and that heading is the combined result.

Shop rows show the time left. A featured series row also names the series you locked in. Server rows show the buffs chosen at the last midnight and when they end. Prestige rows show each percent and how many times it has stacked, such as burns paying 2% more when you have taken that stamp twice.

The Economy page uses the same groups and the same sentences.

## What the effect line says

The line is the result, not the arithmetic. A shop-only Four cards buff says "Your drops have four cards." under Shop.

- Shop grab cooldown alone: "Reduces your grab cooldown to 2 minutes 30 seconds."
- Shop and server grab cooldown: "Reduces your grab cooldown to 1 minute 15 seconds."
- Shop and server drop cooldown: "Reduces your drop cooldown to 5 minutes."
- Shiny luck from one source: "Mints appear 1 in 51 cards."
- Shiny luck from both: "Mints appear 1 in 34 cards."
- A mint prestige with no shiny buff: "Mints appear a little more often than 1 in 100 cards." The same nudge sits on top of 1 in 51 or 1 in 34 when a shiny buff is also up.
- With no shiny buff and no mint prestige, inventory does not mention mints. A normal drop stays 1 in 100.
- Four cards: "Your drops have four cards."
- Quality over quantity: "Your drops have one card, and main characters are much more likely."
- A prestige percent sits on its own line, such as "Burns pay 2% more."

## Parameters

None. `ai is cool` is not the command. `ai` alone is.

## Aliases

`i`, `inv`, and `items`.

## Example usage

```
/inventory
ai
ainv
```

## See also

- [Shop](/commands/shop)
- [Server buff pool](/economy/server-pool)
- [Prestige](/prestige/overview)

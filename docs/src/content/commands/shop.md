---
title: Shop
description: Buy a personal buff. One item per page, with previous, next, and buy.
command: shop
shortcuts: is, itemshop
---

**/shop** opens the first buff. The message shows the name, what it does, the price, how long it lasts, and how many bits you have. Featured series also shows today's series name.

Three buttons sit under it: previous, next, and buy. Previous is quiet on the first item. Next is quiet on the last. Buy purchases the item on that page. Akira edits the message to say it went through, or that you cannot afford it.

Buy is the button on that message.

Buying starts the clock. Buying the same buff again adds the duration onto the time you have left. These are not items you stack in a pile. `/inventory` lists what is currently on you.

## The seven buffs

| Buff | Cost | Lasts | What you get |
| --- | --- | --- | --- |
| Drop cooldown | 400 | 24 hours | Your drop wait is 10 minutes instead of 20. |
| Grab cooldown | 350 | 12 hours | Your grab wait is 2 minutes 30 seconds instead of 5. |
| Burn value | 300 | 24 hours | `/burn` pays double. |
| Four cards | 500 | 24 hours | Your drop has four cards instead of three. |
| Shiny luck | 600 | 24 hours | Mints appear 1 in 51 cards instead of 1 in 100. |
| Featured series | 450 | 24 hours | One series is twice as likely in your drops. |
| Quality over quantity | 500 | 24 hours | Your drop is a single card, and main characters show up much more often. |

A normal drop is still three cards, and a mint is still 1 in 100, until one of these is on you.

## A few rules that matter

- **Four cards never becomes five.** If the server has Four cards as well, your drop is still four. A fourth grab reaction is added.
- **One card wins.** If Quality over quantity is also on, the drop is one card, not four.
- **You do not pick the series.** Every night, at the same midnight UTC as the [server pool](/economy/server-pool), the shop chooses one series that has at least one character and prints that name on Featured series. Buying locks that series onto your buff, so the next night does not swap what you already paid for.
- **Burn value, Featured series, and Quality over quantity are shop-only.** The server pool cannot grant them.
- **Main characters** are the leads of a series. Supporting characters, and anyone who has no role stored, can still appear. They just show up much less often while Quality over quantity is on.

The same shop and the same Buy button are on the Economy page.

## Parameters

None.

## Aliases

`is` and `itemshop`. `ais` opens the shop. `ais cool` is ignored.

## Example usage

```
/shop
ais
```

## See also

- [Inventory](/commands/inventory)
- [Server buff pool](/economy/server-pool)
- [Bits](/economy/bits)

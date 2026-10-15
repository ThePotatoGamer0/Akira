---
title: Server buff pool
description: A shared pot. At midnight the bits you gave become a buff for the whole server.
---

The **server pool** is one pot for the whole server. Anyone can put bits in. At midnight UTC, Akira looks at the pot and applies a buff for the next 24 hours. If the bot was offline at midnight, it does that roll when it comes back, as long as that night has not already been rolled. The result is announced in the drop channel.

Midnight UTC is the same moment for everyone. In the UK that is 1am while the clocks are on summer time.

This is not a chance roll. If the pot reached a tier, a buff from that tier is applied. Under **500** bits, nothing is applied and the bits stay in the pot for another night.

## Giving bits

[`/pool give 200`](/commands/pool) moves 200 bits from you into the pot. The same 200 also fills your [milestone bar](/economy/personal-milestone). Buying from the [shop](/commands/shop) does not fill the bar.

A gift stays a gift. The milestone payout is always smaller than the bits you put in.

## What tonight can be

The tier is the highest one the pot reached. Akira picks from that tier and every tier below it.

- **500 bits, tier 1.** Grab cooldown. That is the only choice, so 500 bits always gives grab cooldown.
- **2,000 bits, tier 2.** One of grab cooldown, drop cooldown, or shiny luck.
- **2,500 bits, tier 3.** Four cards joins that list. One buff is still chosen.
- **5,000 bits, tier 4.** No new buff. Two different buffs are chosen from the tier 3 list, and the second one is guaranteed.

At 500 or more, the pot is spent down to 0. The buff lasts 24 hours.

## How it sits with the shop

The server copy and your shop copy of the same buff meet in the middle, then stop.

- Grab cooldown from both is **1 minute 15 seconds**, not shorter.
- Drop cooldown from both is **5 minutes**, not shorter.
- Shiny luck from one of them makes mints **1 in 51** cards. From both, mints are **1 in 34** cards. It does not go further.
- Four cards from both is still four cards. If you also have Quality over quantity, the drop is one card.

Drop cooldown, shiny luck, grab cooldown, and four cards are the only pool buffs. Burn value, featured series, and Quality over quantity stay in the shop.

A [prestige](/prestige/overview) percent applies after those stops. The 5 minute and 1 minute 15 second floors do not block the small prestige shorten.

`/pool` shows the pot, the tier, which buffs can be chosen tonight, and the buff or buffs that are already live. The Economy page shows the same thing.

## See also

- [Pool command](/commands/pool)
- [Personal milestones](/economy/personal-milestone)
- [Shop](/commands/shop)
- [Bits](/economy/bits)

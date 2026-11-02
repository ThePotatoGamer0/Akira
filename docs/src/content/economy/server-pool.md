---
title: Server buff pool
description: A shared pot. At midnight the bits you gave become a buff for the whole server.
---

The **server pool** is one pot for the whole server. It only runs in a server Akira's owner is in. Anywhere else, giving bits or looking at the pot gets "You cannot use the server pool in a private server." Anyone in a server she shares can put bits in. At midnight UTC, Akira looks at the pot and applies a buff for the next 24 hours. If the bot was offline at midnight, it does that roll when it comes back, as long as that night has not already been rolled. The result is announced in the drop channel.

Midnight UTC is the same moment for everyone. In the UK that is 1am while the clocks are on summer time.

This is not a chance roll. If the pot reached a tier, a buff from that tier is applied. Under **500** bits, nothing is applied and the bits stay in the pot for another night.

## Giving bits

[`/pool give 200`](/commands/pool) moves 200 bits from you into the pot. The same 200 also fills your [milestone bar](/economy/personal-milestone). Buying from the [shop](/commands/shop) does not fill the bar.

A gift stays a gift. The milestone payout is always smaller than the bits you put in.

## What tonight can be

The tier is the highest one the pot reached. Akira picks from that tier and every tier below it. A pot only buys a buff once it passes 10,000 bits; until then the tiers still decide which buff that is.

- **500 bits, tier 1.** Grab cooldown. That is the only choice, so 500 bits always gives grab cooldown.
- **2,000 bits, tier 2.** One of grab cooldown, drop cooldown, or shiny luck.
- **2,500 bits, tier 3.** Four cards joins that list. One buff is still chosen.
- **5,000 bits, tier 4.** No new buff. Two different buffs are chosen from the tier 3 list, and the second one is guaranteed.

The buff lasts 24 hours.

## The large goals

Above the tiers, three goals change what the pot buys.

- **10,000 bits.** The night's buffs include **tracked pull**. It is a server buff, so everyone gets it while it runs: each drop leans toward the series its own player tracks, five times as heavily as any other series. A player who tracks nothing drops as usual.
- **25,000 bits.** A poll opens in the server's pool channel and closes at midnight UTC. The winning buff is guaranteed in the roll. The other buff is still chosen at random, and it is never the same one twice.
- **50,000 bits.** The same poll, but the top two buffs are both guaranteed, with no random pick.

The goals stack on the tiers. At 10,000 and above the tracked pull is always applied on top, so a tier 4 night is `tracked pull` plus two of the four tier buffs. A pot at 30,000 gives that pair with one of them chosen by the poll. That is the most a night can give: three buffs, and never a fourth from the poll.

## What stays in the pot

Only the goal reached is spent. Everything above it stays in the pot for the next night.

| Pot | Goal reached | Spent | Carried to tomorrow |
| ---: | ---: | ---: | ---: |
| 52,000 | 50,000 | 50,000 | 2,000 |
| 31,250 | 25,000 | 25,000 | 6,250 |
| 10,400 | 10,000 | 10,000 | 400 |
| 7,000 | none | 0 | 7,000 |

A pot under 10,000 spends nothing at all and keeps building.

## How it sits with the shop

The server copy and your shop copy of the same buff meet in the middle, then stop.

- Grab cooldown from both is **1 minute 15 seconds**, not shorter.
- Drop cooldown from both is **5 minutes**, not shorter.
- Shiny luck from one of them makes mints **1 in 51** cards. From both, mints are **1 in 34** cards. It does not go further.
- Four cards from both is still four cards. If you also have Quality over quantity, the drop is one card.

Drop cooldown, shiny luck, grab cooldown, four cards, and tracked pull are the only pool buffs. Burn value, featured series, and Quality over quantity stay in the shop.

A [prestige](/prestige/overview) percent applies after those stops. The 5 minute and 1 minute 15 second floors do not block the small prestige shorten.

`/pool` shows the pot, the tier, which buffs can be chosen tonight, and the buff or buffs that are already live. The Economy page shows the same thing.

An admin sets where the poll goes with `/pool channel`. Without one, the poll falls back to the drop channel. With neither, the night's buffs are chosen at random.

## See also

- [Pool command](/commands/pool)
- [Personal milestones](/economy/personal-milestone)
- [Shop](/commands/shop)
- [Bits](/economy/bits)

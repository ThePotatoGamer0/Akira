---
title: Command list
description: Every command Akira answers, with its parameters and text aliases.
---

Slash commands use Discord's menu. Text commands start with **`a`**. Set `AKIRA_PREFIX` if the server wants a different letter. `adrop` and `a drop` are the same command.

The words after the name have to be exactly the parameters that command accepts. Extra words are left alone, so `ad please` does not drop a card. A character name may be several words. A card code or a reminder action is one word. An optional player has to be a mention, `<@id>`.

The full command name always works after the prefix (`acollection`). The short aliases below are the extra names.

## Cards

| Command | Parameters | Aliases |
| --- | --- | --- |
| [`/drop`](/commands/drop) | None. Has to be used in the drop channel. | `d` |
| [Grab](/commands/grab) | No command. React 1️⃣ 2️⃣ or 3️⃣ on the drop. A four-card drop also takes 4️⃣. | |
| [`/collection`](/commands/collection) | `user` optional. A mention. Defaults to you. Optional filters: `s:` series, `c:` character, `e:` edition, `t:` tag, `q:` quality 1-5, `o:#` low prints, `o:w` wishlists. `type is value` works too. | `c`, `col` |
| [`/view`](/commands/view) | `card_id` required for `/view`. Prefix `av` or `aview` with no code opens the card you just grabbed. | `v` |
| [`/burn`](/commands/burn) | `card_id` required for `/burn`. Prefix `ab` or `kb` with no code asks, then burns the last grab. | `b` |
| [`/multiburn`](/commands/multiburn) | `tag_name` required. Burns every card on that tag after a confirmation. | `mb` |
| [`/lookup`](/commands/lookup) | `name` required for `/lookup`. Character, series, or alias. Several words are fine. Prefix `alu` with no name opens the character of the last grab, on that edition. | `lu`, `search`, `find` |
| [`/wishlist`](/commands/wishlist) | `show` with optional `user`. `add` with required `character`. `remove` with required `character`. | `wl`. Add: `wa`, `wish`, `wishadd`. Remove: `wr`, `wishremove`. |
| [`/cc`](/commands/cc) | `show` lists missing characters in tracked series. `add` and `remove` take a series name. A unique start of the name is enough. | `cc` |
| [`/frame`](/commands/frame) | `show` lists the frames. `default` with a required frame name or number (admin). `personal` with a frame name, number, or `clear`. `card` with required `card_id` and `action` (`clear`, a name, or a number). | |
| [`/give`](/commands/give) | `user` and `card_id`, both required. Both players press the check mark. | `g` |
| [`/trade`](/commands/trade) | `user`, `card_id`, and `their_card`, all required. Both players press the check mark. | |
| [`/multitrade`](/commands/multitrade) | `user` required. A mention. After they agree, send card codes and `100 bits` in that channel. | `mt` |
| [`/tag`](/commands/tag) | `tag_name` required. `card_ids` optional, space-separated. No codes tags the last grab. | `t` |
| [`/taglist`](/commands/taglist) | `user` optional. | `tags`, `tl` |
| [`/tagcreate`](/commands/tagcreate) | `tag_name` and `emoji`, both required. Server emojis are not allowed. | `tagadd`, `ta`, `tc` |
| [`/tagdelete`](/commands/tagdelete) | `tag_name` required. | `tagremove`, `tr`, `td` |
| [`/untag`](/commands/untag) | `card_ids` optional, space-separated. No codes untags the last grab. | `ut` |

Examples: `ad`, `ac`, `av`, `av fmbl40r`, `alu denji`, `awl`, `awa Power`, `awr Power`, `acc`, `acc add Demon S`, `acc remove Cyberpunk`, `aframe`, `aframe default 1`, `aframe personal pink`, `aframe card fmbl40r clear`, `agive @friend fmbl40r`, `atrade @friend fmbl40r abc1234`, `amt @friend`.

## Timers

| Command | Parameters | Aliases |
| --- | --- | --- |
| [`/cooldowns`](/commands/cooldowns) | `user` optional. | `cd`, `timers` |
| [`/daily`](/commands/daily) | None. | |
| [`/compensate`](/commands/compensate) | None. Pays 100 bits after an outage of at least 30 minutes. Open for 48 hours. | |
| [`/reminders`](/commands/reminders) | `action` optional: `daily`, `drop`, or `grab`. Omit it to see the list. | `rm`, `remind` |

Examples: `acd`, `atimers`, `adaily`, `areminders`, `areminders drop`, `arm drop`.

## Bits

| Command | Parameters | Aliases |
| --- | --- | --- |
| [`/shop`](/commands/shop) | None. Opens the first buff. Previous, next, and buy are buttons. | `is`, `itemshop` |
| [`/inventory`](/commands/inventory) | None. | `i`, `inv`, `items` |
| [`/pool`](/commands/pool) | `show`, or `give` with a required bit amount. | |
| [`/milestone`](/commands/milestone) | `show`, or `claim`. | |
| [`/prestige`](/commands/prestige) | None. A confirm button appears after milestone 5 is claimed. | |

Examples: `ais`, `ai`, `apool`, `apool give 200`, `amilestone`, `amilestone claim`, `aprestige`.

## Players

| Command | Parameters | Aliases |
| --- | --- | --- |
| [`/userinfo`](/commands/userinfo) | `user` optional. | `ui`, `whois` |
| [`/help`](/commands/help) | None. Also saves your Discord name for the WebUI. | |
| [`/ping`](/commands/ping) | None. Also saves your Discord name for the WebUI. | |

Examples: `aui`, `awhois`, `ahelp`, `aping`.

## Not finished yet

These commands answer, then say the feature is not wired up. They take no parameters.

| Command | Aliases |
| --- | --- |
| [`/dye`](/commands/dye) | |
| [`/import`](/commands/import) | |

`ai` only runs when there is nothing after it. `ai is cool` is a normal sentence. `at` is tag, so `at fav` tags a card and `at the store` is left alone.

## Server admin

[`/set`](/commands/set) has no parameters. An admin runs it in the channel where cards should drop. Until someone does, Akira ignores commands in that server. `aset` is the text form.

[`aoverridekaruta`](/commands/override-karuta) is text only. An admin gets an **Are you sure?** prompt. Yes makes that server also accept `k` and `k!`. Change Karuta's prefix before turning it on. Run it again to turn it off.

## See also

- [Drop](/commands/drop)
- [Your first card](/getting-started/your-first-card)
- [Adding a series](/contributing/adding-characters)

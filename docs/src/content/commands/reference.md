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
| [Grab](/commands/grab) | No command. React 1️⃣ 2️⃣ or 3️⃣ on the drop. | |
| [`/collection`](/commands/collection) | `user` optional. A mention. Defaults to you. | `c`, `col` |
| [`/view`](/commands/view) | `card_id` required for `/view`. Prefix `av` or `aview` with no code opens the card you just grabbed. | `v` |
| [`/burn`](/commands/burn) | `card_id` required. The 7 character code. | `b` |
| [`/lookup`](/commands/lookup) | `name` required. Character, series, or alias. Several words are fine. | `lu`, `search`, `find` |
| [`/wishlist`](/commands/wishlist) | `show` with optional `user`. `add` with required `character`. `remove` with required `character`. | `wl`. Add: `wa`, `wish`, `wishadd`. Remove: `wr`, `wishremove`. |
| [`/frame`](/commands/frame) | `show`. `default` with required `frame` id (admin). `card` with required `card_id` and `action` (`clear` or a frame id). | |

Examples: `ad`, `ac`, `av`, `av fmbl40r`, `alu denji`, `awl`, `awa Power`, `awr Power`, `aframe`, `aframe default 1`, `aframe card fmbl40r clear`.

## Timers

| Command | Parameters | Aliases |
| --- | --- | --- |
| [`/cooldowns`](/commands/cooldowns) | `user` optional. | `cd`, `timers` |
| [`/daily`](/commands/daily) | None. | |
| [`/reminders`](/commands/reminders) | `action` optional: `daily`, `drop`, or `grab`. Omit it to see the list. | `rm`, `remind` |

Examples: `acd`, `atimers`, `adaily`, `areminders`, `areminders drop`, `arm drop`.

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
| [`/multiburn`](/commands/multiburn) | `mb` |
| [`/give`](/commands/give) | `g` |
| [`/trade`](/commands/trade) | |
| [`/shop`](/commands/shop) | `is`, `itemshop` |
| [`/inventory`](/commands/inventory) | `i`, `inv`, `items` |
| [`/tags`](/commands/tags) | `t`, `tl`, `taglist` |
| [`/dye`](/commands/dye) | |
| [`/pool`](/commands/pool) | |
| [`/import`](/commands/import) | |

`ai` and `at` only run when there is nothing after them. `ai is cool` is a normal sentence.

## Server admin

[`aoverridekaruta`](/commands/override-karuta) is text only. An admin gets an **Are you sure?** prompt. Yes makes that server also accept `k` and `k!`. Change Karuta's prefix before turning it on. Run it again to turn it off.

## See also

- [Drop](/commands/drop)
- [Your first card](/getting-started/your-first-card)
- [Adding a series](/contributing/adding-characters)

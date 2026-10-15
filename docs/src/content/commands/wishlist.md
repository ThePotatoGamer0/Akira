---
title: Wishlist
description: Watch characters and get pinged when one of them is in a drop.
command: wishlist
shortcuts: wl, wa, wish, wishadd, wr, wishremove
---

**/wishlist** has three subcommands. Show lists a wishlist. Add and remove change yours. When a drop includes a character you watch, Akira mentions you on that drop.

## Parameters

| Subcommand | Parameters |
| --- | --- |
| `show` | `user` optional. Defaults to you. A bare `awl` uses show. |
| `add` | `character` required. Several words are one name. |
| `remove` | `character` required. |

## Aliases

`wl` shows a wishlist. `wa`, `wish`, and `wishadd` add. `wr` and `wishremove` remove.

`awa Power` adds Power. `awr tanjirou kamado` removes that name. `awa` with no name is ignored.

## Example usage

```
/wishlist show
/wishlist add character:Denji
/wishlist remove character:Denji
awl
awa Denji
awr Denji
```

## See also

- [Lookup](/commands/lookup)
- [Drop](/commands/drop)
- [Grab](/commands/grab)
- [Command list](/commands/reference)

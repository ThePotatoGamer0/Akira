---
title: Lookup
description: Search the card pool by character or series, then page through that character's editions.
command: lookup
shortcuts: lu, search, find
---

**/lookup** answers with a numbered list and a menu. Pick a character to see the series, wishlist count, aliases, how many prints exist, and how many are in circulation. Buttons move between editions. An edition is one card image for that character. The portrait in the corner is that edition's art.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `name` | Yes for `/lookup` | A character, series, or alias. Several words count as one name. |

## Aliases

`lu`, `search`, and `find`. `alu tanjirou kamado` searches that whole name. `alu` with nothing after it opens the character behind the card you last grabbed, on that card's edition. `av` still opens that exact copy. Slash `/lookup` still needs a name.

## Example usage

```
/lookup name:Denji
alu denji
alu
asearch Chainsaw Man
```

## Tips

- Matches are listed 25 at a time, which is as many as the menu can hold. The buttons under the menu move between pages. Back returns to the page you were on. Exact names come first, then names that start with the search, then names that contain it.
- Owning the card still means grabbing it from a [drop](/commands/drop).

## See also

- [Wishlist](/commands/wishlist)
- [Collection](/commands/collection)
- [Command list](/commands/reference)

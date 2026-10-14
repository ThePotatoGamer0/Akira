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
| `name` | Yes | A character, series, or alias. Several words count as one name. |

## Aliases

`lu`, `search`, and `find`. `alu tanjirou kamado` searches that whole name. `alu` alone is ignored.

## Example usage

```
/lookup name:Denji
alu denji
asearch Chainsaw Man
```

## Tips

- Up to 25 matches are listed. Exact names come first, then names that start with the search, then names that contain it.
- Owning the card still means grabbing it from a [drop](/commands/drop).

## See also

- [Wishlist](/commands/wishlist)
- [Collection](/commands/collection)
- [Command list](/commands/reference)

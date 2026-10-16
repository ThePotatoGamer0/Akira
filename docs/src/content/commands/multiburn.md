---
title: Multiburn
description: Burn every card on one of your tags.
command: multiburn
shortcuts: mb
---

**/multiburn** burns every card you own that has one tag. Akira asks first. The confirmation says how many cards will burn and names the rarest one. Press **Yes** to burn them. Press **No** to leave them.

Cards in an open give or trade are left alone. The bits are the plain [burn](/commands/burn) table: 20, 50, 100, 200, or 500 from the quality. Burn value and a burn prestige percent apply to a single `/burn`, not to this pile.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `tag_name` | Yes | A tag you created. One word. |

## Aliases

`mb`. `amb fav` asks to burn the cards tagged fav. `amb` alone is ignored.

## Example usage

```
/multiburn tag_name:fav
amb fav
amultiburn fav
```

## See also

- [Burn](/commands/burn)
- [Tag](/commands/tag)
- [Command list](/commands/reference)

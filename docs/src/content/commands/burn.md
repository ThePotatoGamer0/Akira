---
title: Burn
description: Destroy a card you own and take its bits.
command: burn
shortcuts: b
---

**/burn** deletes a card you own, plays the burn animation, and pays bits from its quality.

| Quality | Bits |
| --- | --- |
| Common | 20 |
| Uncommon | 50 |
| Rare | 100 |
| Epic | 200 |
| Legendary | 500 |

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `card_id` | Yes | The 7 character card code. |

## Aliases

`b`. `ab fmbl40r` burns that card. `ab` alone is ignored.

## Example usage

```
/burn card_id:fmbl40r
ab fmbl40r
```

## Tips

- Burns are permanent.
- [Burn value](/commands/shop) doubles this payout while it is on you. A prestige percent adds a little more on the same burn.
- [Multiburn](/commands/multiburn) burns every card on a tag after you confirm. It pays the table above, not the doubled rate.
- The [collection page](/webui/collection) can burn the card you are looking at, or several you select. One card pays this table. A batch pays the plain rates.

## See also

- [Bits](/economy/bits)
- [View](/commands/view)
- [Command list](/commands/reference)

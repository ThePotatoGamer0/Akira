---
title: Burn
description: Destroy a card you own and take its bits.
command: burn
shortcuts: b
---

**/burn** deletes a card you own, plays the burn animation, and pays bits from its quality.

| Quality | Bits |
| --- | --- |
| Common | 10 |
| Uncommon | 25 |
| Rare | 50 |
| Epic | 100 |
| Legendary | 250 |

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
- [Multiburn](/commands/multiburn) is not finished.

## See also

- [Bits](/economy/bits)
- [View](/commands/view)
- [Command list](/commands/reference)

---
title: Pool
description: See the server pot, or give bits toward tonight's buff.
command: pool
---

**/pool** shows the shared pot: how many bits are in it, which tier that is, which buffs can be chosen tonight, and which buff or buffs are already live.

**/pool give** moves bits from you into the pot. The same amount fills your [milestone bar](/economy/personal-milestone). `give` needs a whole number of bits, at least 1.

On the website, the Economy page has the same pot and a box for the gift.

## Parameters

`/pool` has two actions.

| Action | What you pass | What it does |
| --- | --- | --- |
| `show` | Nothing | The pot, the tier, tonight's choices, and the live buffs. |
| `give` | `bits`, required | Moves that many bits into the pot and your milestone bar. |

`apool` on its own is the same as show. `apool give 200` is the gift.

## Aliases

No short alias.

## Example usage

```
/pool
apool
/pool give bits:200
apool give 200
```

## See also

- [Server buff pool](/economy/server-pool)
- [Personal milestones](/economy/personal-milestone)
- [Bits](/economy/bits)

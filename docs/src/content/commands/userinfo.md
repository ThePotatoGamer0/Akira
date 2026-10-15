---
title: Userinfo
description: Bits, card count, prestige, and milestone numbers for one player.
command: userinfo
shortcuts: ui, whois
---

**/userinfo** replies with the name Akira uses, bits, how many cards they own, prestige level, milestones claimed this cycle, bits given to the pool this cycle, and any daily bonus already on the profile. "This cycle" is the current milestone bar. Prestige sets that cycle back to the start.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `user` | No | A mention. Defaults to you. |

## Aliases

`ui` and `whois`. `aui` and `awhois` work.

## Example usage

```
/userinfo
aui <@123>
```

## See also

- [Collection](/commands/collection)
- [Bits](/economy/bits)
- [Personal milestones](/economy/personal-milestone)
- [Command list](/commands/reference)

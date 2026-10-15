---
title: Milestone
description: See the ten steps on your bar, or claim the next payout.
command: milestone
---

**/milestone** lists all ten steps. Each row shows the bit payout. From step 6 onward it also shows the prestige reward, which you only receive if you prestige after that step is claimed.

It also says which step you are on, how many bits are left until the next one, and which prestige buffs you would keep if you prestiged right now.

**/milestone claim** takes the next step when your bar has enough. Akira pays those bits immediately. The rest of the bar stays. Claiming does not stamp a prestige buff.

## Parameters

| Action | What you pass | What it does |
| --- | --- | --- |
| `show` | Nothing | The ten steps and where you are. |
| `claim` | Nothing | Pays the next step, if the bar has reached it. |

`amilestone` on its own is the list. `amilestone claim` takes the payout.

## Aliases

No short alias.

## Example usage

```
/milestone
amilestone
amilestone claim
```

## See also

- [Personal milestones](/economy/personal-milestone)
- [Prestige](/commands/prestige)
- [Pool](/commands/pool)

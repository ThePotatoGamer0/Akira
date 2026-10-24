---
title: Milestone
description: See the ten steps on your bar, or claim the next payout.
command: milestone
---

**/milestone** lists all ten steps. The first step is **250** bits and pays 200. Each step after that asks for twice as many bits. The tenth is **128,000** bits and pays 30,000. From step 6 onward the row also shows the prestige reward, which you only receive if you prestige after that step is claimed.

| Step | Bits on the bar | Bits you get back |
| --- | --- | --- |
| 1 | 250 | 200 |
| 2 | 500 | 350 |
| 3 | 1,000 | 600 |
| 4 | 2,000 | 1,000 |
| 5 | 4,000 | 2,000 |
| 6 | 8,000 | 3,500 |
| 7 | 16,000 | 6,000 |
| 8 | 32,000 | 10,000 |
| 9 | 64,000 | 18,000 |
| 10 | 128,000 | 30,000 |

The reply is an embed. It says which step the bar is filling, how many bits are left until the next one, and which prestige buffs you would keep if you prestiged right now. A bar at the top shows how full the current step is. From step 6 the prestige sentence sits on the line under that step.

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

---
title: Cooldowns
description: See whether grab, drop, and daily are ready.
command: cooldowns
shortcuts: cd, timers
---

**/cooldowns** shows Grab, Drop, and Daily for one player. Each line says the timer is ready, or how long is left.

A normal grab is 5 minutes, a normal drop is 20 minutes, and daily is 24 hours. They do not share a clock. While a shop or server cooldown buff is on you, the grab or drop line is already the shorter wait. A prestige percent can shave a little more off after that. Daily does not change.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `user` | No | A mention. Defaults to you. |

## Aliases

`cd` and `timers`. `acd` and `atimers` work. `acd @friend` looks at that person.

## Example usage

```
/cooldowns
acd
acd <@123>
```

## See also

- [Reminders](/commands/reminders)
- [Drop](/commands/drop)
- [Grab](/commands/grab)
- [Daily](/commands/daily)

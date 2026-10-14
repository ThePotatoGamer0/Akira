---
title: Reminders
description: Choose which cooldown endings Akira should DM you about.
command: reminders
shortcuts: rm, remind
---

**/reminders** lists Daily, Drop, and Grab. A bell means she will DM you when that timer ends. A muted bell means she will not. Under each one is whether it is ready or how long is left.

Vote, work, and visit are not on the list.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `action` | No | `daily`, `drop`, or `grab`. Toggles that ping. Leave it out to only see the list. |

## Aliases

`rm` and `remind`. `areminders drop` and `arm drop` both toggle the drop ping.

## Example usage

```
/reminders
/reminders action:drop
areminders
areminders grab
```

## Tips

- The DM says the cooldown is ready. Discord has to allow her DMs.
- Turning a ping on while a timer is already running schedules that DM. Turning it off cancels the pending one.
- A ping that is already ready does not send a message until the next time that cooldown starts.

## See also

- [Cooldowns](/commands/cooldowns)
- [Command list](/commands/reference)

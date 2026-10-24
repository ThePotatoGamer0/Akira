---
title: Checklist
description: The characters you still don't have in the series you track.
command: cc
shortcuts: cc
---

**/cc** lists the series pinned on your WebUI completion card. One embed page is one series. Under the name, every character you do not own yet sits on its own line. Buttons move between series. A series with a long missing list gets extra pages of its own.

A series you have finished says you have every character. Akira tracks four series, the same four the WebUI uses.

## Parameters

| Subcommand | Parameters |
| --- | --- |
| `show` | None. A bare `acc` uses show. |
| `add` | `series` required. Several words are one name. |
| `remove` | `series` required. |

A unique start of the name is enough. `Demon S` becomes Demon Slayer when no other series starts that way. If several series fit, Akira lists them and waits for a longer name.

## Aliases

`cc`. `acc` and `kcc` are the same command.

## Example usage

```
/cc show
/cc add series:Demon Slayer
/cc remove series:Cyberpunk
acc
acc add Demon S
acc remove Cyberpunk
```

## See also

- [Collection](/commands/collection)
- [Lookup](/commands/lookup)
- [Command list](/commands/reference)

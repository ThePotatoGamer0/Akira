---
title: Multitrade
description: Trade several cards and bits with another player. Both of you lock in.
command: multitrade
shortcuts: mt
---

**`/multitrade`** asks another player to open a trade. Nothing moves until they press **Agree**, you both add what you want, and you both press **Lock**.

After they agree, the message becomes two embeds. Each title is a username. The code block under it is what that player is offering.

Either player adds to their own side by sending a message in that channel. A card code offers that card. `100 bits` offers bits. Separate several offers with commas.

```
v847vnm, 100 bits
```

**Cancel** ends the trade immediately. Either player can press it. **Lock** needs both of you. Adding a card or more bits clears both locks, so you both press it again.

The trade closes after 10 minutes without a change. A card in the trade can't be burned, given, or put in another trade until then. Bits stay in your balance until both locks land. A card's tag is cleared when it moves.

## Parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `user` | Yes | Who you are trading with. A mention in text commands. |

## Aliases

`mt`. `amt @friend` works. On a server that also listens for Karuta's prefix, `kmt @friend` works too.

## Example usage

```
/multitrade user:@friend
amt @friend
v847vnm, 100 bits
```

## See also

- [Trade](/commands/trade)
- [Give](/commands/give)
- [Bits](/economy/bits)
- [Command list](/commands/reference)

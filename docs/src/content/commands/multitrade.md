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

## Fair trades

Akira prices every card from its quality, how rare that print is, and its print number. Bits count one for one. The footer of the trade shows how many trade points you two have left today.

- **Gifts are always fine.** If one side has nothing on it, the trade goes through at any size. A gift also has no bits cap.
- **Heads up past 2x.** When one side is worth more than twice the other, the footer says so. It still completes.
- **Blocked past 5x.** When the larger side is at least 2,000 points and more than five times the smaller, Lock cancels the trade. An admin can press **Allow anyway** to complete it.
- **2,000 bits per side.** Once both of you have something on your side, neither can put up more than 2,000 bits. A one-sided gift is not capped.
- **4,000 points a day per pair.** Everything you two trade in a day, both directions, adds up. Past it, a two-sided trade waits until tomorrow. A gift can still go through: press **Release**, and the other player presses it too.
- **10 minutes after a trade.** Both of you rest before opening another give or multitrade. Cancelled trades do not start this. A [give](/commands/give) counts as a completed trade too.
- **A modest pace.** `/multitrade` and `/give` wait 30 seconds between uses, per player.

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

---
title: Trade
description: Swap a card with another player. Both of you have to accept.
command: trade
---

**`/trade`** offers one of your cards for one of theirs. Akira can tell who owns each code, so a mention is optional and the two codes can be in either order. Nothing moves until both of you press the check mark. Either of you can press the cross to cancel. The offer expires after 5 minutes. In text commands, a comma between the two codes is the same as a space.

The message is a **Card Trade** embed. The image is the two cards with a swap arrow between them. Each player's card line sits under their name.

## Parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `user` | No | Who you are trading with. Akira already knows from the cards. |
| `card_id` | Yes | One of the two cards. |
| `their_card` | Yes | The other card. |

## Aliases

No short alias. `atrade` works.

## Example usage

```
/trade card_id:v8pj8pz their_card:v8znvrx
atrade v8pj8pz v8znvrx
atrade v8pj8pz, v8znvrx
```

## See also

- [Multitrade](/commands/multitrade)
- [Give](/commands/give)
- [Command list](/commands/reference)

---
title: Trade
description: Swap a card with another player. Both of you have to accept.
command: trade
---

**`/trade`** offers one of your cards for one of theirs. Nothing moves until both of you press the check mark. Either of you can press the cross to cancel. The offer expires after 5 minutes.

The message is a **Card Trade** embed. The image is the two cards with a swap arrow between them. Each player's card line sits under their name.

## Parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `user` | Yes | Who you are trading with. A mention in text commands. |
| `card_id` | Yes | Your card. |
| `their_card` | Yes | Their card. |

## Aliases

No short alias. `atrade` works.

## Example usage

```
/trade user:@friend card_id:v8pj8pz their_card:v8znvrx
atrade @friend v8pj8pz v8znvrx
```

## See also

- [Multitrade](/commands/multitrade)
- [Give](/commands/give)
- [Command list](/commands/reference)

---
title: Give
description: Offer a card to another player. Both of you have to accept.
command: give
shortcuts: g
---

**`/give`** offers one of your cards to someone else. Nothing moves until both of you press the check mark. Either of you can press the cross to cancel. The offer expires after 5 minutes.

The message is a **Card Transfer** embed: you, an arrow, them, the card line, and the card image.

## Parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `user` | Yes | Who receives the card. A mention in text commands. |
| `card_id` | Yes | The card you are giving. |

## Aliases

`g`. `ag` works.

## Example usage

```
/give user:@friend card_id:v8znvrx
agive @friend v8znvrx
```

## See also

- [Trade](/commands/trade)
- [Command list](/commands/reference)

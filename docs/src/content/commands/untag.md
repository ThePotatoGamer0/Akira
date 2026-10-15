---
title: Untag
description: Take the tag off cards you own.
command: untag
shortcuts: ut
---

**/untag** clears the tag on cards you own. The line goes back to ◾.

Leave the card codes out and Akira untags the last card you grabbed.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `card_ids` | No | Card codes separated by spaces. Each one is 7 characters. |

## Aliases

`ut`. `aut` untags your last grab. `aut hello` is a normal sentence, because the words have to be card codes.

## Example usage

```
/untag card_ids:4bqz1p6
auntag 4bqz1p6 abc1234
aut
```

## See also

- [Tag](/commands/tag)
- [Tag list](/commands/taglist)

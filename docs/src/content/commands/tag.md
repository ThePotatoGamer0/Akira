---
title: Tag
description: Put one of your tags on cards you own.
command: tag
shortcuts: t
---

**/tag** sets a tag on cards you own. The tag's emoji is shown on the left of that card's line. A card with no tag shows ◾.

Leave the card codes out and Akira tags the last card you grabbed.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `tag_name` | Yes | A tag you created. One word. |
| `card_ids` | No | Card codes separated by spaces. Each one is 7 characters. |

## Aliases

`t`. `at fav` tags your last grab. `at the store` is a normal sentence, because the words after the tag name have to be card codes.

## Example usage

```
/tag tag_name:fav card_ids:4bqz1p6
atag fav 4bqz1p6 abc1234
at fav
```

## See also

- [Tag list](/commands/taglist)
- [Create a tag](/commands/tagcreate)
- [Untag](/commands/untag)
- [Collection](/commands/collection)

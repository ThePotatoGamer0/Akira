---
title: Create a tag
description: Make a tag and choose the emoji shown beside those cards.
command: tagcreate
shortcuts: tagadd, ta, tc
---

**/tagcreate** makes a tag for you. The name is one word: letters, numbers, `-` and `_`. The emoji is the mark on the left of a tagged card.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `tag_name` | Yes | The name. |
| `emoji` | Yes | One emoji. |

## Aliases

`tagadd`, `ta`, `tc`. `atagadd fav ⭐`, `ata fav ⭐`, and `atc fav ⭐` work. Server emojis are not allowed.

## Example usage

```
/tagcreate tag_name:fav emoji:⭐
atagcreate fav ⭐
```

## See also

- [Tag](/commands/tag)
- [Delete a tag](/commands/tagdelete)

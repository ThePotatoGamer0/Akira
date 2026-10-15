---
title: Delete a tag
description: Remove a tag and clear it from your cards.
command: tagdelete
shortcuts: tagremove, tr, td
---

**/tagdelete** removes one of your tags. Cards that had it go back to ◾.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `tag_name` | Yes | The tag to remove. |

## Aliases

`tagremove`, `tr`, `td`. `atagremove fav`, `atr fav`, and `atd fav` work.

## Example usage

```
/tagdelete tag_name:fav
atagdelete fav
```

## See also

- [Create a tag](/commands/tagcreate)
- [Tag list](/commands/taglist)

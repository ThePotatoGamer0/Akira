---
title: Collection
description: List the cards someone owns, ten at a time.
command: collection
shortcuts: c, col
---

**/collection** posts a public list of owned cards. Each line is the code, stars, print, frame, series, and character. Buttons turn the page when there are more than ten cards.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `user` | No | A mention. Defaults to you. |

## Aliases

`c` and `col`. `ac` and `acol` work. `ac @friend` looks at that person's cards. `ac hello` is ignored.

## Example usage

```
/collection
/collection user:@friend
ac
acol <@123>
```

## Tips

- The WebUI [collection](/webui/collection) is the grid. This command is the chat list.
- The frame number is the card's own frame, or the server default. See [frame](/commands/frame).

## See also

- [View](/commands/view)
- [Lookup](/commands/lookup)
- [Command list](/commands/reference)

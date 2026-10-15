---
title: Collection
description: List the cards someone owns, ten at a time.
command: collection
shortcuts: c, col
---

**/collection** posts a public list of owned cards. Each line is the code, stars, print, frame, series, and character. Buttons turn the page when there are more than ten cards.

Filters go after the command. A filter is `type:value` or `type is value`. Several can be used together. A value runs until the next filter. The mention, when there is one, comes first.

| Filter | What it keeps |
| --- | --- |
| `s` | Series name. `s:Death Note` or `s is My Hero Academia`. |
| `c` | Character name. `c:Izuku Midoriya`. |
| `e` | Edition number, starting at 1. The same order as [lookup](/commands/lookup). |
| `t` | Tag name. `t:fav`. |
| `q` | Quality. `1` common, `2` uncommon, `3` rare, `4` epic, `5` legendary. Names work too. |
| `o` | Sort. `o:#` puts lower prints first. `o:w` puts the most wishlisted characters first. |

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `user` | No | A mention. Defaults to you. |
| `filters` | No | One or more filters, as above. |

## Aliases

`c` and `col`. `ac` and `acol` work. `ac @friend` looks at that person's cards. `ac hello` is ignored. `ac s:Death Note` is a filter.

## Example usage

```
/collection
/collection user:@friend filters:s:Death Note q:4
ac
ac s is My Hero Academia
ac @friend c:Izuku o:#
acol <@123>
```

## Tips

- The WebUI [collection](/webui/collection) is the grid. This command is the chat list.
- The frame number is the card's own frame, or the server default. See [frame](/commands/frame).

## See also

- [View](/commands/view)
- [Lookup](/commands/lookup)
- [Command list](/commands/reference)

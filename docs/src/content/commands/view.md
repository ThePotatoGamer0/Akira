---
title: View
description: Open one card by its 7 character code, or the card you just grabbed.
command: view
shortcuts: v
---

**/view** draws that card and shows the code, stars, print, frame, series, and character. The code is seven letters or digits, such as `fmbl40r`.

## Parameters

| Name | Required | What it is |
| --- | --- | --- |
| `card_id` | Yes for `/view` | The 7 character card code. |

On a text command, leave the code off and Akira opens the card you last grabbed.

## Aliases

`v`. `av` and `aview` are the same command. `av` with no code uses the last grab. `av fmbl40r` views that code instead.

## Example usage

```
/view card_id:fmbl40r
av
av fmbl40r
```

## Tips

- Slash `/view` always asks for the code. The empty form is only the text command.
- The frame in the picture is the card's own frame, or the server default when the card does not have one. See [frame](/commands/frame).

## See also

- [Grab](/commands/grab)
- [Collection](/commands/collection)
- [Command list](/commands/reference)

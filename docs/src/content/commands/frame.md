---
title: Frame
description: See or change the frame drawn around cards.
command: frame
---

A frame is a folder in `input/frames`, numbered from 0. Frame 0 is the dark frame that ships as the default. The others are the same polaroid in yellow, white, red, blue, green, pink, purple, orange, and teal. A card with no frame of its own is drawn with the server's default. A card that has been given a frame keeps that one.

`aframe` on its own lists every frame that is on disk, with its name and number.

## Parameters

| Subcommand | Parameters | Who can use it |
| --- | --- | --- |
| `show` | None. This is what a bare `aframe` does. It lists the frames. | Anyone |
| `default` | `frame` required. A frame id. | Server admin |
| `card` | `card_id` required. `action` required: a frame id, or `clear`. | The card's owner |

`clear` sends the card back to the server default.

## Aliases

No short alias. `aframe`, `aframe default 1`, and `aframe card fmbl40r 1` use the command name.

## Example usage

```
/frame show
/frame default frame:1
/frame card card_id:fmbl40r action:1
/frame card card_id:fmbl40r action:clear
aframe
aframe default 1
aframe card fmbl40r clear
```

## Tips

- Adding a frame means a new folder, `input/frames/1/frame.png` plus `config.json`, then `aframe default yellow`.
- Long names use two lines when one line does not fit, then a smaller size until the name stays inside the frame.

## See also

- [View](/commands/view)
- [Command list](/commands/reference)

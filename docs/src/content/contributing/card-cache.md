---
title: Rebuilding the card cache
description: Redraw saved card pictures on the Pi, or send that work to a PC on the same wifi.
---

Every grabbed card keeps a picture under the cache folder. After a frame or portrait change those files need a redraw. Two host prefix commands do that, and both pause drops until they finish.

## On the Pi

`arefresh` redraws every cached picture on the Pi itself. That is the right choice when you are away from the PC. It uses every CPU in the box, and it still takes a while when thousands of files are waiting.

## On your PC

`afarm` is the faster path when you are home. Akira pauses, DMs you her wifi address and a short code, and waits for your computer.

1. In Discord, as the host, run `afarm`.
2. Open her DM and copy the `npm run farm` line. It is the URL, then the code.
3. In the Akira repo on your PC, run that line.

Your PC pulls each portrait and frame from the Pi, draws the pictures, and sends them back into `/home/james/akira-data/cards`. She comes back when the last file lands, or after twenty minutes if the PC never arrives. `afarm cancel` stops the wait.

Stay on wifi. Sending thousands of GIFs through the public API works, and it is slower. If she prints the wrong address, set `AKIRA_FARM_URL` on the stack.

## See also

- [Adding a series](/contributing/adding-characters)
- [Contributing code](/contributing/code)

---
title: Grab
description: React on a live drop to claim that card. There is no grab command.
---

Grabbing is the number reaction on a [drop](/commands/drop). 1️⃣ takes the first card, 2️⃣ the second, and 3️⃣ the third. Akira checks that the drop is still open, the card is free, and your grab cooldown has finished.

There is no `/grab` and no `agrab`.

## Example

React on the drop message:

```
1️⃣
```

## Tips

- Grab cooldown is 5 minutes. It is separate from the 20 minute drop cooldown.
- A drop closes after 2 minutes. Unclaimed cards are not added to anyone's collection.
- A successful grab mints a 7 character card code, assigns the next print for that image, pays 5 bits, and posts a separate message. The drop picture stays as it was.
- After that, `av` with no code opens the card you just grabbed. See [view](/commands/view).

## See also

- [Drop](/commands/drop)
- [View](/commands/view)
- [Cooldowns](/commands/cooldowns)
- [Collection](/commands/collection)

# Server pool: 10k, 25k, 50k goals

Design note. The pot is inflating past what the current tiers were built for (5,000
tops out), so three larger goals are added above the existing ones. Read from
`src/game/buffs.ts` (tiers, picks) and `src/game/live-buffs.ts` (roll, snapshot),
then `src/bot/pool-midnight.ts` (announcement) and `src/bot/commands/pool.ts`.

## The goals

| Goal | Buff |
| ---: | :--- |
| 10k | **Tracked pull.** Server-wide, but each card leans toward the tracked series of the player whose drop it is. |
| 25k | **Chosen slot.** A poll in the pool channel decides one buff. That buff is guaranteed into the roll. The other slot rolls at random. |
| 50k | **Chosen pair.** Same poll. Both highest-voted buffs are guaranteed into the roll. |

A pot that passes 25k but not 50k still gets the 50k treatment's replacement, not
in addition to it: 25k means "one chosen, one random", 50k means "two chosen, none
random". Reaching 50k does not give you three buffs.

**As built:** the poll's winners replace a tier slot rather than adding one, so a
pot that passes 50k but is still only at tier 3 gets the top vote and the other
buff rolled at random. A pot only gets two buffs from the old 5,000 tier up.

## Tiers stay cumulative

The 5,000 tier is untouched, so the goals stack on top rather than replacing
them. A pot at 12k:

- Tier 4 (two buffs) from the old ladder, still in play.
- Extra: tracked pull.

A pot at 30k: two buffs, one chosen by the poll, and tracked pull.
A pot at 60k: two buffs, both chosen by the poll, and tracked pull.

The slot count does not grow past two. What changes at 25k and 50k is how the two
slots are filled.

## Pool buff kinds

`BUFF_KINDS` gains one entry, `tracked_pull`. It is a server buff only. It does
not appear in the shop, and `SHOP_ITEMS` is untouched, so nothing changes for a
player buying a buff.

`SERVER_POOL` gains no entry for it. It is granted by the 10k goal, never by a
roll, so `poolChoices` must not list it and `pickServerBuffs` must not pick it.

## 10k: how the lean works

There are three kinds of drop and they lean differently.

**`/drop` in the channel (and its website equivalent).** The drop belongs to
whoever cast it, so the pool is weighted toward *their* tracked series
(`TrackedSeries` rows for that user). This is per card, so a three-card drop can
bring three different tracked series. It composes with the shop's Featured
series, which still rolls its 90% first: a card that hits Featured comes from that
series, otherwise it rolls from the tracked-weighted pool.

**Personal drops.** A drop someone triggers for themselves leans toward their own
tracked series. Same rule, same code path.

**A drop with no owner** (there is none today, but the helper should say what it
does): no lean, the plain pool.

The weight of a tracked series is not a seat count. Every variant in a tracked
series gets `TRACKED_PULL_MULTIPLIER`, a flat multiplier on top of `artWeight`, so
rarity ordering inside the series is preserved. An untracked series keeps its
weight. With no tracked series, every weight is `1` and the roll is identical to
today's.

`TRACKED_PULL_MULTIPLIER` is **5**, in `src/game/balance.ts` with the other knobs, applied per variant on top of `artWeight`. It needs a test that measures the share with and without the buff. `activeEffects` only fetches that user's tracked series when `tracked_pull` is live, and the shelf stops pre-drawing plain strips while it runs, because a strip would then depend on who drops it.

## 25k and 50k: the poll

### Where it goes

A new channel setting, `/pool channel`, admin only, stores the channel the poll is
posted in. It is separate from the drop channel `/set`.

The setting goes in `GuildConfig` beside `dropChannelId`, as `poolChannelId`, with
`resolvePoolChannelId` and `setPoolChannel` mirroring the drop channel's pair in
`src/game/drops.ts`. There is no separate env var; an unset pool channel falls back
to the drop channel, so the poll is not forced into a channel nobody chose. If a
guild has neither, the poll is skipped and the roll falls back to a plain random
pick. Never block the roll on a missing channel.

### When it opens

The poll opens the moment the pot crosses 25,000, in the pool channel, and
closes at midnight UTC. Crossing earlier in the day gives players longer to vote.
It does not reopen if the bot restarts: the poll message id and the day it went
out are stored on the pool row, so a restart (and every later gift that day) sees
the poll is already open.

Only one poll is open at a time per guild. A pot past 50k at the same moment it
crosses 25k uses the same poll; the 50k treatment just takes two winners from it.

### The question and the choices

Native Discord poll (`MessageCreate` → `poll`, or `channel.send({ poll })`),
duration until midnight UTC, `allowMultiselect: false`, no expiry extension.

- Question: `Tonight's pot passed 25,000: which server buff should it give? The poll closes at midnight UTC.` At 50,000 it asks for two instead.
- Choices: the four buffs a tier-4 pot can roll (grab cooldown, drop cooldown, shiny luck, four cards), minus any the server already holds, plus tracked pull. Quality over quantity and burn value are never pool buffs.

### Reading the result

At midnight, in this order:

1. Roll the pot as today, for the tier.
2. If the pot is past 25k, read the poll's votes, sort by count, tie-break by the answer's position in the poll.
3. Replace the first `n` slots with the winners, where `n` is 1 below 50k and 2 at or above it.
4. Fill any remaining slot at random from the tier's own choices, skipping the buffs already chosen.

A poll with no votes (nobody played) leaves the roll as today's: random, two
slots at tier 4. A poll that was never posted, because no channel was set, does
the same.

### Reading votes without holding the process

Discord populates `poll.results.answer_counts` on the message as votes arrive.
At midnight the roll fetches the poll message, matches each `answer_id` to the
choice it was created with, and sorts. No custom vote table: one less schema, and
the counts are what Discord shows players.

The catch, since it is a native poll: Discord clears `vote_count` details once a
poll ends, so the read must happen before the poll is closed. Close it
immediately *after* reading, or let it expire at midnight and read the cached
message the midnight job already has in hand.

## Spending the pot: keep the remainder

Chosen: spend only the goal reached and carry the rest into tomorrow.

As built, the old tiers stay where they were and become *part* of the goals, so
the spend boundaries are the goal boundaries:

```
pot 30,000  -> goal 25,000  -> spent 25,000, carried 5,000
pot 12,000  -> goal 10,000  -> spent 10,000, carried 2,000
pot 52,000  -> goal 50,000  -> spent 50,000, carried 2,000
pot  7,000  -> no goal      -> spent 0, carried 7,000
```

A pot between 500 and 10,000 spends nothing and keeps every bit, so it rolls
again tomorrow instead of buying a small buff. `poolSpend` in `src/game/buffs.ts`
is the source of truth. `lastReset` still guards one roll per UTC day, and
`missedMidnight` still governs a roll after downtime.

A pot under 500 still rolls nothing, as before.

This replaces `totalBits: 0` in `rollServerPool`. `ServerPool` gains
`carriedBits Int @default(0)`; the pot shown to players stays `totalBits` (the
live pot), and the carried number is displayed next to it so people can see what
tomorrow starts with. A gift adds to `totalBits` as now.

`lastReset` still guards one roll per UTC day, and `missedMidnight` still governs
a roll after downtime.

## WebUI

`/economy` reads `view.pool`, which grows these fields:

- `goal`: the highest goal passed, or 0.
- `carriedBits`: yesterday's remainder.
- `choices`: includes the tracked pull once the pot is past 10k.

`/pool show` prints the same, and the carried line only when there is one. A
per-goal progress line and the poll's live tally are still to do.

## Tests

- `poolTier` and `poolGoal` agree at every boundary: 9,999 / 10,000 / 24,999 / 25,000 / 49,999 / 50,000.
- Spend-and-carry at each goal, and below 500.
- `tracked_pull` never appears in `poolChoices` or `pickServerBuffs`.
- A drop by a player tracking a series pulls from it far more often with the buff than without.
- Poll results: two slots, no repeat; one slot below 50k; no votes falls back to random.

As built, `src/game/pool-poll.test.ts` covers the ranking and the label mapping, and
`src/game/live-buffs.test.ts` covers the roll, the carry, and per-player tracking.

## Open (not needed to start)

- **Does the lean reach the shop's Featured pick?** No. Featured is a series the shop chooses for the server, not a card the pool rolls, and the request said "each player's". Leaving it alone keeps the shop's wording true.
- **Should the poll show what each buff does?** Native poll choices are 55 characters. The names fit; the descriptions do not. A short line above the poll can carry the descriptions.

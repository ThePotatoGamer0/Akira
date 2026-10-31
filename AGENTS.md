# Akira

Rules for anyone (human or agent) committing to this repository.

## Never commit

- **`assets/`** — this is a generated cache of card art. It is rebuilt on every
  deployment and must not be pushed in the image. If it shows as changed,
  leave it alone; do not stage, restore, or "clean it up" in a commit.
- **`.cursor/`** — editor and agent settings for one machine.
- **The dev database** — `prisma/akira.db` and any `*.db` copy or backup beside
  it (for example `prisma/akira.db.pre-refactor`). It is local working data.
- **`docs/.astro/settings.json`** — Astro writes this per machine.

Both the `assets/` and `docs/.astro/settings.json` rules are also enforced in
`.gitignore`. The database rule is enforced by `*.db`, but a backup with another
suffix (`.pre-refactor`, `.bak`, `.old`) is not matched, so check by name.

## Committing

- Stage the files the work touched, not `git add -A`.
- Keep unrelated in-progress work out of a commit; say what was left out.
- Never push unless asked.

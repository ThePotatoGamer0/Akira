---
title: Adding a series
description: Pull a show's cast from AniList and add those cards to the drop pool.
---

A series is a folder under `input/characters`. The folder name is the slug. Hyphens become spaces if AniList titles are not stored yet, so `demon-slayer` falls back to Demon Slayer. Players pick English or Romaji in Settings.

## Add a whole series

From the repository root:

```bash
npm run portraits -- my-hero-academia
npm run portraits:install
npm run covers -- my-hero-academia
npm run titles -- my-hero-academia
npm run init
```

`portraits` looks the show up on AniList and saves one headshot per main and supporting character under `input/portraits`. `portraits:install` copies those into `input/characters/<series>/<character>/base.png` with a `character.json`. `covers` saves the AniList poster to `input/series/<slug>/cover.png` for the Characters page. `titles` writes the romaji and English names into `input/characters/<series>/series.json`. `npm run init` loads that folder into the database. Restart the bot after that.

Several series can be named in one portraits command:

```bash
npm run portraits -- blue-lock servamp one-piece naruto
```

## What the scripts will and will not do

- The folder slug is the search. `dragon-ball-z` works. `dbz` does not, because it is searched as the word "Dbz". Extra search names go in `series.json` as `aliases`. `titles` fills `romaji` and `english` from AniList. Sono Bisque Doll Wa Koi Wo Suru also lists My Dress-Up Darling so hyphen and space spellings both match.
- A title has to match AniList's English or romaji name after the slug is spaced out. `my-dress-up-darling` needs a search override in `scripts/anilist.ts` because the real title still has a hyphen.
- Each run stops at 100 characters, main and supporting only. Demon Slayer also pulls the later TV seasons into the same folder. A character already in the folder is left as it is.
- Danganronpa resolves to the anime, not the visual novels. Yu-Gi-Oh is split across several shows, and the plain name does not match AniList's title.
- Every installed `base.png` is an equal drop. Delete character folders you do not want before `npm run init`.
- AniList art is a headshot. Replace `base.png` when you have a wider shot. Alternate arts are a second image you add by hand in `character.json`.

## See also

- [Local environment setup](/contributing/local-setup)
- [Drop](/commands/drop)

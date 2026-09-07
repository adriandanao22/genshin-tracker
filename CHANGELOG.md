# Changelog

All notable changes to Orbital Atlas are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-09-07

First public release. A Genshin Impact build & farming planner that connects to
HoYoLAB and grades your characters against community team comps.

### Added

- **HoYoLAB connection** — sign in with email/password (RSA-encrypted, GeeTest
  captcha handled) or paste tokens manually. The session lives only in an
  AES-GCM encrypted, httpOnly cookie; no credentials are stored server-side.
- **Overview** — a daily farming plan: Today's Domains broken down per talent
  book series (Teachings/Guide/Philosophies tiers) with contributing characters,
  Weekly Bosses with boss portraits, a By-Character panel, and total mora owed.
- **My Roster** — your characters with a ☆/★ build-priority pin and team
  suggestions.
- **Build Guides** — a searchable directory of all 118 characters with full
  reference pages: recommended weapons/artifacts, skills, constellations, and
  ascension materials.
- **Teams (Team Planner)** — team comps grouped by `<Main DPS> <Reaction>`
  archetype (derived from HoYoLAB lineups), showing which members you own vs.
  need. Pick a comp to **build**, which pins its members and drives suggestions
  everywhere.
- **Character detail modal**
  - Editable current → target planning for level, talents, constellation, and
    weapon level.
  - Weapon & artifact **image pickers** showing rarity, secondary stat, tier,
    per-comp **pick rate**, and which pieces you already own.
  - "Follow guide" resolves to the selected comp's actual weapon/set/main stats.
  - **Materials to farm**, including weapon ascension materials.
  - Currently-equipped artifact stats (main stat + substats).
  - **Build & artifact grader** — per-piece roll-value grades + crit value, an
    overall build grade, and a "farm artifacts or good enough?" verdict.
- **Persistence** — build plans, priority, and the active comp are saved per
  account and optionally synced across devices via Supabase. The game UID is
  stored only as an HMAC pseudonym; no credentials or account data are persisted.
- **Static game data** extracted from [genshin-db](https://github.com/theBowja/genshin-db)
  into `public/gamedata/` (`npm run extract-gamedata`), plus an interactive-map
  crop extractor (`npm run extract-map`). Icons are served from
  [Project Amber](https://gi.yatta.moe).

[0.1.0]: https://github.com/your-org/orbital-atlas/releases/tag/v0.1.0

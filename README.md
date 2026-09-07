# Orbital Atlas

A Genshin Impact **build & farming planner** that connects to your HoYoLAB
account, shows you what to farm and where, and grades your characters against
real community team comps.

> ⚠️ **Fan project.** Orbital Atlas is not affiliated with, endorsed by, or
> associated with HoYoverse / miHoYo / Cognosphere. "Genshin Impact" and all
> game data and art are property of HoYoverse. This tool talks to undocumented
> HoYoLAB endpoints — use it at your own risk.

## Features

- **Connect via HoYoLAB** — email/password login (encrypted client-side, GeeTest
  captcha handled) or manual token entry. Your session lives only in an
  encrypted, httpOnly cookie.
- **Overview** — a daily farming plan: today's talent-book domains broken down by
  tier with the characters that need them, weekly bosses with portraits, and
  total mora owed.
- **My Roster** — your characters with build-priority pins and team suggestions.
- **Build Guides** — every character's recommended weapons, artifacts, skills,
  constellations, and ascension materials.
- **Team Planner** — comps grouped by `<Main DPS> <Reaction>` archetype from
  HoYoLAB lineups, with owned-vs-missing members. Pick a comp to _build_ and it
  drives the suggestions everywhere.
- **Character planner** — editable current→target goals, weapon/artifact image
  pickers with per-comp pick rates and owned-weapon marking, materials to farm
  (incl. weapon ascension), and a **build + artifact grader** that tells you
  whether to farm artifacts or your build is good enough.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
optional Supabase (Postgres) for cross-device sync. Factual game data comes from
[genshin-db](https://github.com/theBowja/genshin-db); icons from
[Project Amber](https://gi.yatta.moe); team comps from HoYoLAB's public Lineup
Simulator.

## Getting started

```bash
npm install
npm run extract-gamedata   # writes public/gamedata/*.json from genshin-db
npm run dev                # http://localhost:3000
```

Create `.env.local` (see [`.env.example`](.env.example)):

```bash
# Required — a stable random secret. Encrypts the session cookie AND derives the
# UID pseudonym key. Rotating it logs everyone out. Generate with:
#   openssl rand -base64 48
HOYOLAB_SESSION_SECRET=

# Optional — enable cross-device sync. Omit both to run localStorage-only.
# Server-side only; use the SECRET key (sb_secret_… / legacy service_role),
# never the publishable key. Do NOT prefix with NEXT_PUBLIC_.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

### Supabase (optional)

Run [`supabase/schema.sql`](supabase/schema.sql) in your project's SQL editor.
The app degrades gracefully to localStorage-only when Supabase isn't configured.
Only non-sensitive planning data (build plans, priority, active comp) is stored,
keyed by an HMAC pseudonym of your game UID — **no credentials or roster data are
persisted**.

## Deploy

Deploys to [Vercel](https://vercel.com) as a standard Next.js app. Set the same
environment variables in the project settings; `HOYOLAB_SESSION_SECRET` is
required. Regenerate `public/gamedata/*.json` (`npm run extract-gamedata`) after
each game patch and commit the result — the app serves those as static files.

## Privacy & data

- HoYoLAB credentials are used only to obtain a session and are stored **only**
  in an encrypted httpOnly cookie in your browser.
- Your roster, artifacts, and stats are fetched live and cached in-memory only —
  never written to a database.
- Cross-device sync stores only your build plans, priority, and selected comp,
  under a one-way HMAC of your UID.

## Contributing

Contributions are welcome — bug fixes, new curated build guides, better grading
heuristics, and UI polish especially. Please:

1. Open an issue to discuss substantial changes first.
2. Keep `npm run build` and `npx tsc --noEmit` clean.
3. Don't commit secrets — `.env*` is gitignored (except `.env.example`).
4. Remember the game data and art belong to HoYoverse; don't vendor copyrighted
   assets into the repo (we hotlink icons and extract factual data only).

The `main` branch is protected by a ruleset (see
[`.github/rulesets/`](.github/rulesets/)): PRs require the `build` check to pass
and one approving review.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

See [LICENSE](LICENSE).

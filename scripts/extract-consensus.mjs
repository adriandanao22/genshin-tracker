/**
 * Pre-generates community-consensus builds for every character from HoYoLAB's
 * public Lineup Simulator API, so the app has a first-class guide source that
 * covers all characters (not just the hand-written ones) without any scraping
 * of third-party guide sites.
 *
 * Output: public/gamedata/consensus.json  =  { [characterId]: ConsensusBuild }
 * Re-run after a patch to refresh: `npm run extract-consensus`.
 *
 * Mirrors the aggregation in lib/hoyolab-lineup.ts (kept in sync by hand — the
 * runtime still fetches live for freshness; this is the bundled baseline).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = "https://sg-public-api.hoyoverse.com/event/simulatoros";
const LIMIT = 20;
const DELAY_MS = 250;

const displayStat = (name) => name.replace(/\s*Percentage$/i, "%");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ranked(counts) {
  return [...counts.entries()]
    .map(([name, votes]) => ({ name, votes }))
    .sort((a, b) => b.votes - a.votes);
}
function tally(counts, key, by = 1) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + by);
}

async function fetchLineups(id) {
  const url =
    `${API}/lineup/index?next_page_token=&limit=${LIMIT}` +
    `&tag_id=&order=Hot&roles=${id}&lang=en-us`;
  const res = await fetch(url, { headers: { "x-rpc-language": "en-us" } });
  const payload = await res.json();
  if (payload.retcode !== 0) throw new Error(payload.message ?? "Lineup API error");
  return payload.data?.list ?? [];
}

function aggregate(characterId, lineups) {
  const entries = [];
  for (const lineup of lineups)
    for (const group of lineup.avatar_group ?? [])
      for (const character of group.group ?? [])
        if (character.id === characterId) entries.push(character);
  if (entries.length === 0) return null;

  const weaponVotes = new Map();
  const weaponRarity = new Map();
  const setVotes = new Map();
  const roleVotes = new Map();
  const slotVotes = { sands: new Map(), goblet: new Map(), circlet: new Map() };
  const slotByCat = { 3: "sands", 4: "goblet", 5: "circlet" };
  const substatScores = new Map();
  let strategyUrl = null;

  for (const entry of entries) {
    if (entry.weapon?.name) {
      tally(weaponVotes, entry.weapon.name);
      weaponRarity.set(entry.weapon.name, entry.weapon.level ?? 4);
    }
    for (const set of entry.set_list ?? []) tally(setVotes, set.name);
    tally(roleVotes, entry.avatar_tag?.name ?? undefined);
    for (const attr of entry.first_attr ?? []) {
      const slot = attr.cat_id ? slotByCat[attr.cat_id] : undefined;
      if (slot && attr.name) tally(slotVotes[slot], displayStat(attr.name));
    }
    const substats = entry.secondary_attr_name ?? [];
    substats.forEach((stat, index) => {
      if (stat.name) tally(substatScores, displayStat(stat.name), substats.length - index);
    });
    if (!strategyUrl && entry.strategy_url) strategyUrl = entry.strategy_url;
  }

  return {
    characterId,
    role: ranked(roleVotes)[0]?.name ?? null,
    sampleSize: entries.length,
    strategyUrl,
    weapons: ranked(weaponVotes).map((o) => ({
      ...o,
      rarity: weaponRarity.get(o.name) ?? 4,
    })),
    sets: ranked(setVotes),
    mainStats: {
      sands: ranked(slotVotes.sands),
      goblet: ranked(slotVotes.goblet),
      circlet: ranked(slotVotes.circlet),
    },
    substats: ranked(substatScores).slice(0, 5).map((o) => o.name),
  };
}

async function main() {
  const buildAssets = JSON.parse(
    readFileSync(join(ROOT, "public/gamedata/build-assets.json"), "utf8"),
  );
  const idMap = buildAssets.characterIdToName ?? {};
  const ids = Object.keys(idMap).map(Number).filter(Boolean);

  const out = {};
  let ok = 0;
  let empty = 0;
  let failed = 0;
  for (const id of ids) {
    const name = idMap[id]?.name ?? idMap[id] ?? id;
    try {
      const consensus = aggregate(id, await fetchLineups(id));
      if (consensus) {
        out[id] = consensus;
        ok++;
      } else {
        empty++;
      }
    } catch (error) {
      failed++;
      console.warn(`  ! ${name} (${id}): ${error.message}`);
    }
    await sleep(DELAY_MS);
  }

  const payload = {
    extractedAt: new Date().toISOString(),
    characterCount: Object.keys(out).length,
    consensus: out,
  };
  const dest = join(ROOT, "public/gamedata/consensus.json");
  writeFileSync(dest, JSON.stringify(payload) + "\n");
  console.log(
    `\nconsensus.json written: ${ok} with data, ${empty} empty, ${failed} failed (of ${ids.length}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

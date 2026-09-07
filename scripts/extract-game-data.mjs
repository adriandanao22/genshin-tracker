/**
 * Extract farming data from genshin-db (devDependency) into a compact static
 * JSON served from public/. Re-run after each game patch:
 *
 *   npm run extract-gamedata
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const db = require("genshin-db");

const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "gamedata",
  "farming.json",
);

const GEM_SUFFIXES = [" Sliver", " Fragment", " Chunk", " Gemstone"];

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function materialInfo(name) {
  const material = db.materials(name);
  if (!material) return null;
  return {
    typeText: material.typeText ?? "",
    days: material.daysOfWeek ?? null,
    domain: material.dropDomainName ?? null,
    sources: material.sources ?? [],
    rarity: material.rarity ?? null,
    icon: material.images?.filename_icon ?? null,
  };
}

function classify(name, info) {
  if (name === "Mora") return "mora";
  if (name === "Crown of Insight") return "crown";
  if (GEM_SUFFIXES.some((suffix) => name.endsWith(suffix))) return "gem";
  if (!info) return "other";
  if (info.typeText.includes("Local Specialty")) return "specialty";
  if (info.typeText.includes("Talent Material") && info.domain) return "book";
  if (info.typeText.includes("Weapon Ascension Material") && info.domain)
    return "weaponAscension";
  if (info.typeText.includes("Enhancement Material")) return "common";
  if (info.sources.some((source) => source.includes("Challenge Reward")))
    return "weekly";
  return "boss";
}

function weeklyBossName(info) {
  for (const source of info?.sources ?? []) {
    const match = source.match(/Lv\. \d+\+ (.+?) Challenge Reward/);
    if (match) return match[1];
  }
  return null;
}

function bossSourceName(info) {
  for (const source of info?.sources ?? []) {
    const match = source.match(/Dropped by (?:Lv\. \d+\+ )?(.+)/i);
    if (match) return match[1];
  }
  return null;
}

// Boss/enemy portrait icon (served from gi.yatta.moe/assets/UI/monster/<f>.png).
// Some Challenge-Reward boss names differ from the enemy entry name in genshin-db.
const ENEMY_ALIAS = {
  "Wolf of the North": "Lupus Boreas",
};
const enemyIconCache = new Map();
function enemyIcon(name) {
  if (!name) return null;
  if (enemyIconCache.has(name)) return enemyIconCache.get(name);
  let icon = null;
  try {
    icon = db.enemy(ENEMY_ALIAS[name] ?? name)?.images?.filename_icon ?? null;
  } catch {
    icon = null;
  }
  enemyIconCache.set(name, icon);
  return icon;
}

const names = db.characters("names", { matchCategories: true });
const characters = {};
const guides = {};
const materialCache = new Map();
const skipped = [];

function skill(entry, slot) {
  if (!entry?.name) return null;
  return { slot, name: entry.name, description: entry.description ?? "" };
}

function cachedInfo(name) {
  if (!materialCache.has(name)) materialCache.set(name, materialInfo(name));
  return materialCache.get(name);
}

for (const name of names) {
  if (name === "Aether" || name === "Lumine") {
    skipped.push(name);
    continue;
  }
  const character = db.characters(name);
  const talent = db.talents(name);
  if (!character?.costs || !talent?.costs) {
    skipped.push(name);
    continue;
  }

  const costItems = (levels) =>
    Object.fromEntries(
      Object.entries(levels).map(([key, items]) => [
        key.replace(/^(lvl|ascend)/, ""),
        items.map((item) => ({ name: item.name, count: item.count })),
      ]),
    );

  // Identify signature materials from representative cost entries.
  const summary = {
    book: null,
    bookDays: null,
    bookDomain: null,
    weekly: null,
    weeklyBoss: null,
    weeklyBossIcon: null,
    boss: null,
    bossSource: null,
    bossIcon: null,
    specialty: null,
    common: null,
    gem: null,
  };
  const allItems = [
    ...Object.values(talent.costs).flat(),
    ...Object.values(character.costs).flat(),
  ];
  for (const item of allItems) {
    const info = cachedInfo(item.name);
    const kind = classify(item.name, info);
    if (kind === "book" && !summary.book && info?.rarity === 2) {
      summary.book = item.name;
      summary.bookDays = info.days;
      summary.bookDomain = info.domain;
    } else if (kind === "weekly" && !summary.weekly) {
      summary.weekly = item.name;
      summary.weeklyBoss = weeklyBossName(info);
      summary.weeklyBossIcon = enemyIcon(summary.weeklyBoss);
    } else if (kind === "specialty" && !summary.specialty) {
      summary.specialty = item.name;
    } else if (kind === "common" && !summary.common && info?.rarity === 1) {
      summary.common = item.name;
    } else if (kind === "gem" && item.name.endsWith(" Gemstone")) {
      summary.gem = item.name.replace(" Gemstone", "");
    } else if (kind === "boss" && !summary.boss) {
      summary.boss = item.name;
      summary.bossSource = bossSourceName(info);
      summary.bossIcon = enemyIcon(summary.bossSource);
    }
  }

  const key = normalize(character.name);
  characters[key] = {
    name: character.name,
    rarity: character.rarity,
    element: character.elementText,
    region: character.region ?? null,
    weaponType: character.weaponText ?? null,
    icon: character.images?.filename_icon ?? null,
    ...summary,
    talentCosts: costItems(talent.costs),
    ascensionCosts: costItems(character.costs),
  };

  // Reference guide data: skills + passives + constellations (from genshin-db).
  let constellations = [];
  try {
    const cons = db.constellations(character.name);
    constellations = ["c1", "c2", "c3", "c4", "c5", "c6"]
      .map((k, index) =>
        cons?.[k]?.name
          ? {
              level: index + 1,
              name: cons[k].name,
              description: cons[k].description ?? "",
            }
          : null,
      )
      .filter(Boolean);
  } catch {
    // some entries (e.g. Traveler variants) may lack constellations
  }

  guides[key] = {
    name: character.name,
    rarity: character.rarity,
    element: character.elementText,
    region: character.region ?? null,
    weaponType: character.weaponText ?? null,
    icon: character.images?.filename_icon ?? null,
    portrait: character.images?.filename_gachaSplash ?? null,
    skills: [
      skill(talent.combat1, "normal"),
      skill(talent.combat2, "skill"),
      skill(talent.combat3, "burst"),
    ].filter(Boolean),
    passives: [
      skill(talent.passive1, "passive"),
      skill(talent.passive2, "passive"),
      skill(talent.passive3, "passive"),
    ].filter(Boolean),
    constellations,
  };
}

// All weapons: icon, rarity, type, secondary stat — for the weapon planner.
const weapons = {};
try {
  const weaponNames = db.weapons("names", { matchCategories: true });
  for (const name of weaponNames) {
    const w = db.weapon(name);
    if (!w) continue;
    // Ascension costs (keyed "1".."6") + register their materials so they land
    // in the shared materials map with icon/kind/days/domain.
    const costs = {};
    for (const [key, items] of Object.entries(w.costs ?? {})) {
      costs[key.replace(/^ascend/, "")] = items.map((it) => ({
        name: it.name,
        count: it.count,
      }));
      for (const it of items) cachedInfo(it.name);
    }
    weapons[normalize(w.name)] = {
      name: w.name,
      rarity: w.rarity ?? null,
      type: w.weaponText ?? null,
      stat: w.mainStatText ?? null,
      icon: w.images?.filename_icon ?? null,
      costs,
    };
  }
} catch (error) {
  console.log("weapon extraction failed:", error?.message);
}

// All artifact sets: representative icon (flower) + top rarity — for the set planner.
const sets = {};
try {
  const setNames = db.artifacts("names", { matchCategories: true });
  for (const name of setNames) {
    const a = db.artifact(name);
    if (!a) continue;
    const rarities = a.rarityList ?? [];
    sets[normalize(a.name)] = {
      name: a.name,
      rarity: rarities.length ? Math.max(...rarities) : null,
      icon: a.images?.filename_flower ?? null,
    };
  }
} catch (error) {
  console.log("artifact extraction failed:", error?.message);
}

// Per-material metadata for everything referenced (kind + farming days).
const materials = {};
for (const [name, info] of materialCache) {
  materials[name] = {
    kind: classify(name, info),
    days: info?.days ?? null,
    domain: info?.domain ?? null,
    rarity: info?.rarity ?? null,
    icon: info?.icon ?? null,
  };
}

mkdirSync(dirname(outFile), { recursive: true });
const output = {
  extractedAt: new Date().toISOString(),
  characterCount: Object.keys(characters).length,
  characters,
  materials,
};
writeFileSync(outFile, JSON.stringify(output));
console.log(
  `Wrote ${Object.keys(characters).length} characters, ${Object.keys(materials).length} materials to ${outFile}`,
);

// Reference guide data (skills + constellations) — a separate file so the
// Build Guides page can lazy-load it without weighing down farming math.
const guidesFile = join(dirname(outFile), "character-guides.json");
writeFileSync(
  guidesFile,
  JSON.stringify({
    extractedAt: new Date().toISOString(),
    characterCount: Object.keys(guides).length,
    characters: guides,
  }),
);
console.log(`Wrote ${Object.keys(guides).length} character guides to ${guidesFile}`);

// Weapon + artifact-set assets (icon/rarity/stat) for the build planner pickers.
const assetsFile = join(dirname(outFile), "build-assets.json");
writeFileSync(
  assetsFile,
  JSON.stringify({
    extractedAt: new Date().toISOString(),
    weapons,
    sets,
  }),
);
console.log(
  `Wrote ${Object.keys(weapons).length} weapons, ${Object.keys(sets).length} sets to ${assetsFile}`,
);
console.log("Skipped:", skipped.join(", ") || "none");
const missing = Object.values(characters).filter(
  (entry) => !entry.book || !entry.weekly || !entry.boss,
);
if (missing.length)
  console.log(
    "Incomplete summaries:",
    missing.map((entry) => entry.name).join(", "),
  );

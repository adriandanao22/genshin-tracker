import "server-only";
import buildAssets from "@/public/gamedata/build-assets.json";
import type {
  RosterCharacter,
  CharacterDetail,
  CharacterArtifact,
  StatLine,
} from "@/lib/hoyolab-game-record";

/**
 * Enka.network adapter — fetches a player's public Character Showcase by UID
 * (no login/credentials) and maps it into the same shapes the HoYoLAB path
 * produces. Weapon/set NAMES are resolved by matching Enka's icon filenames
 * against our extracted assets; character basics come from the id→name map.
 *
 * Limitation: only shows characters in the in-game Showcase, and there's no
 * resin / friendship / full-roster data.
 */

const YATTA = "https://gi.yatta.moe/assets/UI";

type CharBasics = { name: string; element: string | null; rarity: number | null; icon: string | null };
const charById = buildAssets.characterIdToName as Record<string, CharBasics>;

const weaponByIcon: Record<string, { name: string; rarity: number | null; stat: string | null }> = {};
for (const w of Object.values(buildAssets.weapons))
  if (w.icon) weaponByIcon[w.icon] = { name: w.name, rarity: w.rarity, stat: w.stat };

const setByIconId: Record<string, string> = {};
for (const s of Object.values(buildAssets.sets)) {
  const m = /UI_RelicIcon_(\d+)_/.exec(s.icon ?? "");
  if (m) setByIconId[m[1]] = s.name;
}

// Enka FIGHT_PROP enum → our display stat name.
const PROP: Record<string, string> = {
  FIGHT_PROP_HP: "HP",
  FIGHT_PROP_HP_PERCENT: "HP%",
  FIGHT_PROP_ATTACK: "ATK",
  FIGHT_PROP_ATTACK_PERCENT: "ATK%",
  FIGHT_PROP_DEFENSE: "DEF",
  FIGHT_PROP_DEFENSE_PERCENT: "DEF%",
  FIGHT_PROP_CRITICAL: "CRIT Rate",
  FIGHT_PROP_CRITICAL_HURT: "CRIT DMG",
  FIGHT_PROP_CHARGE_EFFICIENCY: "Energy Recharge",
  FIGHT_PROP_ELEMENT_MASTERY: "Elemental Mastery",
  FIGHT_PROP_HEAL_ADD: "Healing Bonus",
  FIGHT_PROP_FIRE_ADD_HURT: "Pyro DMG Bonus",
  FIGHT_PROP_WATER_ADD_HURT: "Hydro DMG Bonus",
  FIGHT_PROP_ELEC_ADD_HURT: "Electro DMG Bonus",
  FIGHT_PROP_WIND_ADD_HURT: "Anemo DMG Bonus",
  FIGHT_PROP_ICE_ADD_HURT: "Cryo DMG Bonus",
  FIGHT_PROP_ROCK_ADD_HURT: "Geo DMG Bonus",
  FIGHT_PROP_GRASS_ADD_HURT: "Dendro DMG Bonus",
  FIGHT_PROP_PHYSICAL_ADD_HURT: "Physical DMG Bonus",
};
const PCT = new Set([
  "HP%", "ATK%", "DEF%", "CRIT Rate", "CRIT DMG", "Energy Recharge",
  "Healing Bonus", "Pyro DMG Bonus", "Hydro DMG Bonus", "Electro DMG Bonus",
  "Anemo DMG Bonus", "Cryo DMG Bonus", "Geo DMG Bonus", "Dendro DMG Bonus",
  "Physical DMG Bonus",
]);
const SLOT: Record<string, { slot: number; name: string }> = {
  EQUIP_BRACER: { slot: 1, name: "Flower" },
  EQUIP_NECKLACE: { slot: 2, name: "Plume" },
  EQUIP_SHOES: { slot: 3, name: "Sands" },
  EQUIP_RING: { slot: 4, name: "Goblet" },
  EQUIP_DRESS: { slot: 5, name: "Circlet" },
};

/** Artifact/weapon stat value (already in display units in Enka's `flat`). */
function statLine(propId: string, value: number): StatLine {
  const name = PROP[propId] ?? propId;
  const v = PCT.has(name) ? `${Math.round(value * 10) / 10}%` : String(Math.round(value));
  return { name, value: v };
}
/** Final combat stats (fightPropMap) — % props come as fractions. */
function finalStat(name: string, raw: number, pct: boolean): StatLine {
  return { name, value: pct ? `${(raw * 100).toFixed(1)}%` : Math.round(raw).toLocaleString() };
}

function serverFromUid(uid: string): string {
  const map: Record<string, string> = { "6": "America", "7": "Europe", "8": "Asia", "9": "TW, HK, MO" };
  return map[uid[0]] ?? "Asia";
}

/* ---------- Raw Enka shapes (only what we read) ---------- */
type EnkaEquip = {
  itemId: number;
  weapon?: { level: number; promoteLevel?: number; affixMap?: Record<string, number> };
  reliquary?: { level: number };
  flat: {
    icon?: string;
    rankLevel?: number;
    equipType?: string;
    weaponStats?: Array<{ appendPropId: string; statValue: number }>;
    reliquaryMainstat?: { mainPropId: string; statValue: number };
    reliquarySubstats?: Array<{ appendPropId: string; statValue: number }>;
  };
};
type EnkaAvatar = {
  avatarId: number;
  propMap?: Record<string, { val?: string }>;
  talentIdList?: number[];
  skillLevelMap?: Record<string, number>;
  fightPropMap?: Record<string, number>;
  equipList?: EnkaEquip[];
};
type EnkaResponse = {
  playerInfo?: { nickname?: string; level?: number };
  avatarInfoList?: EnkaAvatar[];
};

export type EnkaProfile = {
  player: { name: string; uid: string; server: string; level: number | null };
  roster: RosterCharacter[];
  details: Record<number, CharacterDetail>;
};

export class EnkaError extends Error {}

function mapAvatar(a: EnkaAvatar): { roster: RosterCharacter; detail: CharacterDetail } | null {
  const basics = charById[String(a.avatarId)];
  if (!basics) return null;
  const level = Number(a.propMap?.["4001"]?.val ?? "1") || 1;
  const constellation = a.talentIdList?.length ?? 0;
  const icon = basics.icon ? `${YATTA}/${basics.icon}.png` : "";

  // Weapon
  const weaponEquip = a.equipList?.find((e) => e.weapon);
  let weaponDetail: CharacterDetail["weaponDetail"] = null;
  let rosterWeapon: RosterCharacter["weapon"] = null;
  if (weaponEquip?.weapon && weaponEquip.flat.icon) {
    const asset = weaponByIcon[weaponEquip.flat.icon];
    const secondary = (weaponEquip.flat.weaponStats ?? []).find(
      (s) => s.appendPropId !== "FIGHT_PROP_BASE_ATTACK",
    );
    const base = {
      id: weaponEquip.itemId,
      name: asset?.name ?? weaponEquip.flat.icon,
      icon: `${YATTA}/${weaponEquip.flat.icon}.png`,
      rarity: weaponEquip.flat.rankLevel ?? asset?.rarity ?? 5,
      level: weaponEquip.weapon.level,
      refinement: weaponEquip.weapon.affixMap
        ? (Object.values(weaponEquip.weapon.affixMap)[0] ?? 0) + 1
        : 1,
    };
    rosterWeapon = base;
    weaponDetail = {
      ...base,
      ascension: weaponEquip.weapon.promoteLevel ?? 0,
      mainStat: secondary ? statLine(secondary.appendPropId, secondary.statValue) : null,
      subStat: null,
    };
  }

  // Artifacts
  const artifacts: CharacterArtifact[] = [];
  for (const e of a.equipList ?? []) {
    if (!e.reliquary || !e.flat.icon) continue;
    const slotInfo = SLOT[e.flat.equipType ?? ""] ?? { slot: 0, name: "" };
    const setId = /UI_RelicIcon_(\d+)_/.exec(e.flat.icon)?.[1];
    artifacts.push({
      id: e.itemId,
      name: (setId && setByIconId[setId]) || "",
      icon: `${YATTA}/reliquary/${e.flat.icon}.png`,
      slot: slotInfo.slot,
      slotName: slotInfo.name,
      rarity: e.flat.rankLevel ?? 5,
      level: Math.max(0, (e.reliquary.level ?? 1) - 1),
      setName: (setId && setByIconId[setId]) || "",
      setEffects: [],
      mainStat: e.flat.reliquaryMainstat
        ? statLine(e.flat.reliquaryMainstat.mainPropId, e.flat.reliquaryMainstat.statValue)
        : { name: "", value: "" },
      subStats: (e.flat.reliquarySubstats ?? []).map((s) =>
        statLine(s.appendPropId, s.statValue),
      ),
    });
  }

  // Talents: skillLevelMap keyed by skill id, ascending ≈ [Normal, Skill, Burst].
  const talentLevels = Object.entries(a.skillLevelMap ?? {})
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([, lvl]) => lvl);
  const talents = ["Normal Attack", "Elemental Skill", "Elemental Burst"].map(
    (name, i) => ({ id: i, type: 1, name, level: talentLevels[i] ?? 1 }),
  );

  // Final stats we grade against.
  const fp = a.fightPropMap ?? {};
  const stats = [
    finalStat("Max HP", fp["2000"] ?? 0, false),
    finalStat("ATK", fp["2001"] ?? 0, false),
    finalStat("DEF", fp["2002"] ?? 0, false),
    finalStat("Elemental Mastery", fp["28"] ?? 0, false),
    finalStat("CRIT Rate", fp["20"] ?? 0, true),
    finalStat("CRIT DMG", fp["22"] ?? 0, true),
    finalStat("Energy Recharge", fp["23"] ?? 0, true),
  ].map((s) => ({ name: s.name, base: "", final: s.value }));

  const roster: RosterCharacter = {
    id: a.avatarId,
    name: basics.name,
    element: basics.element ?? "",
    rarity: basics.rarity ?? 5,
    level,
    friendship: 0,
    constellation,
    icon,
    weapon: rosterWeapon,
  };
  const detail: CharacterDetail = {
    ...roster,
    image: basics.icon
      ? `${YATTA}/${basics.icon.replace("UI_AvatarIcon_", "UI_Gacha_AvatarImg_")}.png`
      : null,
    weaponDetail,
    artifacts,
    constellations: Array.from({ length: constellation }, (_, i) => ({
      position: i + 1,
      name: `Constellation ${i + 1}`,
      activated: true,
    })),
    talents,
    stats,
  };
  return { roster, detail };
}

// Shared 5-min cache so roster / detail / session don't each hit Enka.
const profileCache = new Map<string, { expires: number; profile: EnkaProfile }>();
export async function getEnkaProfile(
  uid: string,
  force = false,
): Promise<EnkaProfile> {
  const cached = profileCache.get(uid);
  if (!force && cached && cached.expires > Date.now()) return cached.profile;
  const profile = await fetchEnkaProfile(uid);
  profileCache.set(uid, { expires: Date.now() + 5 * 60 * 1000, profile });
  return profile;
}

export async function fetchEnkaProfile(uid: string): Promise<EnkaProfile> {
  const response = await fetch(`https://enka.network/api/uid/${uid}`, {
    headers: { "User-Agent": "OrbitalAtlas/0.1 (github.com/adriandanao22/genshin-tracker)" },
    cache: "no-store",
  });
  if (response.status === 404) throw new EnkaError("That UID wasn't found.");
  if (!response.ok) throw new EnkaError("Enka.network is unavailable right now.");
  const data = (await response.json()) as EnkaResponse;

  const roster: RosterCharacter[] = [];
  const details: Record<number, CharacterDetail> = {};
  for (const avatar of data.avatarInfoList ?? []) {
    const mapped = mapAvatar(avatar);
    if (!mapped) continue;
    roster.push(mapped.roster);
    details[mapped.roster.id] = mapped.detail;
  }
  return {
    player: {
      name: data.playerInfo?.nickname ?? "Traveler",
      uid,
      server: serverFromUid(uid),
      level: data.playerInfo?.level ?? null,
    },
    roster,
    details,
  };
}

import { createHash, randomInt } from "node:crypto";
import { serverByRegion } from "@/lib/hoyolab-auth";
import type { HoyoLabSession } from "@/lib/hoyolab-session";

/**
 * HoYoLAB Battle Chronicle (game record) API.
 *
 * These endpoints require a signed `DS` header on top of the session cookies.
 * character/list returns the roster with equipped weapons; character/detail
 * adds artifacts, talents, constellations, and computed stats.
 */

const RECORD_API = "https://sg-public-api.hoyolab.com/event/game_record/genshin/api";

// Public salt used by the HoYoLAB web frontend (x-rpc-app_version 1.5.0).
const DS_SALT = "6s25p5ox5y14umn1p61aqyyvbvvl3lrt";

const regionByServer: Record<string, string> = Object.fromEntries(
  Object.entries(serverByRegion).map(([region, server]) => [server, region]),
);

function generateDs() {
  const time = Math.floor(Date.now() / 1000);
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let random = "";
  for (let i = 0; i < 6; i += 1)
    random += letters[randomInt(letters.length)];
  const hash = createHash("md5")
    .update(`salt=${DS_SALT}&t=${time}&r=${random}`)
    .digest("hex");
  return `${time},${random},${hash}`;
}

export class GameRecordError extends Error {
  constructor(
    message: string,
    public retcode: number,
  ) {
    super(message);
  }
}

async function requestRecord<T>(
  endpoint: string,
  session: HoyoLabSession,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const region = regionByServer[session.server];
  if (!region)
    throw new GameRecordError(`Unknown server "${session.server}"`, -1);

  const response = await fetch(`${RECORD_API}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `ltuid_v2=${session.ltuid}; ltoken_v2=${session.ltoken}`,
      DS: generateDs(),
      "x-rpc-app_version": "1.5.0",
      "x-rpc-client_type": "5",
      "x-rpc-language": "en-us",
      "User-Agent": "Mozilla/5.0 OrbitalAtlas/0.1",
    },
    body: JSON.stringify({
      role_id: session.uid,
      server: region,
      ...payload,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: T | null;
  };
  if (data.retcode !== 0 || !data.data) {
    throw new GameRecordError(
      data.message ?? "Unknown HoYoLAB error",
      data.retcode ?? -1,
    );
  }
  return data.data;
}

/* ---------- Real-time notes (resin) ---------- */

type RawDailyNote = {
  current_resin: number;
  max_resin: number;
  resin_recovery_time: string; // seconds until full, as a string
};

export type DailyNote = {
  currentResin: number;
  maxResin: number;
  /** Seconds until resin is full (0 when already full). */
  resinRecoveryTime: number;
};

/** Live resin from HoYoLAB's dailyNote endpoint (GET + DS-signed). */
export async function fetchDailyNote(
  session: HoyoLabSession,
): Promise<DailyNote> {
  const region = regionByServer[session.server];
  if (!region)
    throw new GameRecordError(`Unknown server "${session.server}"`, -1);

  const response = await fetch(
    `${RECORD_API}/dailyNote?server=${region}&role_id=${session.uid}`,
    {
      method: "GET",
      headers: {
        Cookie: `ltuid_v2=${session.ltuid}; ltoken_v2=${session.ltoken}`,
        DS: generateDs(),
        "x-rpc-app_version": "1.5.0",
        "x-rpc-client_type": "5",
        "x-rpc-language": "en-us",
        "User-Agent": "Mozilla/5.0 OrbitalAtlas/0.1",
      },
      cache: "no-store",
    },
  );
  const data = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: RawDailyNote | null;
  };
  if (data.retcode !== 0 || !data.data) {
    throw new GameRecordError(
      data.message ?? "Unknown HoYoLAB error",
      data.retcode ?? -1,
    );
  }
  return {
    currentResin: data.data.current_resin,
    maxResin: data.data.max_resin,
    resinRecoveryTime: Number(data.data.resin_recovery_time) || 0,
  };
}

/* ---------- Raw API shapes (only the fields we consume) ---------- */

type RawProperty = { property_type: number; base?: string; final?: string };
type RawArtifactProperty = { property_type: number; value: string; times: number };

type RawBaseCharacter = {
  id: number;
  name: string;
  element: string;
  rarity: number;
  level: number;
  fetter: number;
  actived_constellation_num: number;
  icon: string;
  image?: string;
  weapon?: RawWeapon;
};

type RawWeapon = {
  id: number;
  name: string;
  icon: string;
  rarity: number;
  level: number;
  type: number;
  affix_level: number;
  promote_level?: number;
  main_property?: RawProperty | null;
  sub_property?: RawProperty | null;
};

type RawDetailCharacter = {
  base: RawBaseCharacter;
  weapon: RawWeapon;
  relics: Array<{
    id: number;
    name: string;
    icon: string;
    pos: number;
    pos_name: string;
    rarity: number;
    level: number;
    set: {
      id: number;
      name: string;
      affixes?: Array<{ activation_number: number; effect: string }>;
    };
    main_property: RawArtifactProperty;
    sub_property_list: RawArtifactProperty[];
  }>;
  constellations: Array<{
    id: number;
    name: string;
    icon: string;
    pos: number;
    is_actived: boolean;
  }>;
  skills: Array<{
    skill_id: number;
    skill_type: number;
    name: string;
    level: number;
    icon: string;
    is_unlock: boolean;
  }>;
  selected_properties: RawProperty[];
};

type RawPropInfo = { property_type: number; name: string; filter_name: string };

/* ---------- Normalized shapes the app (and future guides) consume ---------- */

export type RosterWeapon = {
  id: number;
  name: string;
  icon: string;
  rarity: number;
  level: number;
  refinement: number;
};

export type RosterCharacter = {
  id: number;
  name: string;
  element: string;
  rarity: number;
  level: number;
  friendship: number;
  constellation: number;
  icon: string;
  weapon: RosterWeapon | null;
};

export type StatLine = { name: string; value: string; rolls?: number };

export type CharacterArtifact = {
  id: number;
  name: string;
  icon: string;
  slot: number;
  slotName: string;
  rarity: number;
  level: number;
  setName: string;
  setEffects: Array<{ pieces: number; effect: string }>;
  mainStat: StatLine;
  subStats: StatLine[];
};

export type CharacterDetail = RosterCharacter & {
  image: string | null;
  weaponDetail:
    | (RosterWeapon & {
        ascension: number;
        mainStat: StatLine | null;
        subStat: StatLine | null;
      })
    | null;
  artifacts: CharacterArtifact[];
  constellations: Array<{ position: number; name: string; activated: boolean }>;
  talents: Array<{ id: number; type: number; name: string; level: number }>;
  stats: Array<{ name: string; base: string; final: string }>;
};

function normalizeWeapon(weapon?: RawWeapon | null): RosterWeapon | null {
  if (!weapon) return null;
  return {
    id: weapon.id,
    name: weapon.name,
    icon: weapon.icon,
    rarity: weapon.rarity,
    level: weapon.level,
    refinement: weapon.affix_level,
  };
}

function normalizeCharacter(raw: RawBaseCharacter): RosterCharacter {
  return {
    id: raw.id,
    name: raw.name,
    element: raw.element,
    rarity: raw.rarity,
    level: raw.level,
    friendship: raw.fetter,
    constellation: raw.actived_constellation_num,
    icon: raw.icon,
    weapon: normalizeWeapon(raw.weapon),
  };
}

/** All owned characters with their equipped weapon. */
export async function fetchRoster(
  session: HoyoLabSession,
): Promise<RosterCharacter[]> {
  const data = await requestRecord<{ list: RawBaseCharacter[] }>(
    "character/list",
    session,
  );
  return (data.list ?? [])
    .map(normalizeCharacter)
    .sort((a, b) => b.level - a.level || b.rarity - a.rarity);
}

/** Full builds (weapon stats, artifacts, talents) for the given characters. */
export async function fetchCharacterDetails(
  session: HoyoLabSession,
  characterIds: number[],
): Promise<CharacterDetail[]> {
  const data = await requestRecord<{
    list: RawDetailCharacter[];
    property_map: Record<string, RawPropInfo>;
  }>("character/detail", session, { character_ids: characterIds });

  const propertyName = (type: number) =>
    data.property_map?.[String(type)]?.filter_name ||
    data.property_map?.[String(type)]?.name ||
    `Property ${type}`;

  return (data.list ?? []).map((raw) => {
    const weapon = normalizeWeapon(raw.weapon);
    return {
      ...normalizeCharacter({ ...raw.base, weapon: raw.weapon }),
      image: raw.base.image ?? null,
      weaponDetail: weapon
        ? {
            ...weapon,
            ascension: raw.weapon.promote_level ?? 0,
            mainStat: raw.weapon.main_property
              ? {
                  name: propertyName(raw.weapon.main_property.property_type),
                  value: raw.weapon.main_property.final ?? "",
                }
              : null,
            subStat: raw.weapon.sub_property
              ? {
                  name: propertyName(raw.weapon.sub_property.property_type),
                  value: raw.weapon.sub_property.final ?? "",
                }
              : null,
          }
        : null,
      artifacts: (raw.relics ?? []).map((relic) => ({
        id: relic.id,
        name: relic.name,
        icon: relic.icon,
        slot: relic.pos,
        slotName: relic.pos_name,
        rarity: relic.rarity,
        level: relic.level,
        setName: relic.set?.name ?? "",
        setEffects: (relic.set?.affixes ?? []).map((affix) => ({
          pieces: affix.activation_number,
          effect: affix.effect,
        })),
        mainStat: {
          name: propertyName(relic.main_property.property_type),
          value: relic.main_property.value,
        },
        subStats: (relic.sub_property_list ?? []).map((property) => ({
          name: propertyName(property.property_type),
          value: property.value,
          rolls: property.times,
        })),
      })),
      constellations: (raw.constellations ?? []).map((constellation) => ({
        position: constellation.pos,
        name: constellation.name,
        activated: constellation.is_actived,
      })),
      talents: (raw.skills ?? [])
        .filter((skill) => skill.is_unlock)
        .map((skill) => ({
          id: skill.skill_id,
          type: skill.skill_type,
          name: skill.name,
          level: skill.level,
        })),
      stats: (raw.selected_properties ?? []).map((property) => ({
        name: propertyName(property.property_type),
        base: property.base ?? "",
        final: property.final ?? "",
      })),
    };
  });
}

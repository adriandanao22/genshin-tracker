import type { BuildGuide } from "@/lib/build-guides";

/**
 * HoYoLab Lineup Simulator API — public, no auth required.
 *
 * Players publish team lineups that include per-character builds (weapon,
 * artifact sets, main stats per slot, substat priority). We aggregate the
 * top "Hot" lineups for one character into a community-consensus build,
 * which can stand in for a curated guide.
 */

const LINEUP_API = "https://sg-public-api.hoyoverse.com/event/simulatoros";

type RawLineupCharacter = {
  id?: number;
  name?: string;
  head_icon?: string;
  icon?: string;
  avatar_tag?: { name?: string } | null;
  weapon?: { id?: number; name?: string; icon?: string; level?: number } | null;
  set_list?: Array<{ id?: number; name?: string }>;
  first_attr?: Array<{ cat_id?: number; name?: string }>;
  secondary_attr_name?: Array<{ id?: number; name?: string }>;
  strategy_url?: string;
};

type RawLineup = {
  id?: string;
  title?: string;
  like_cnt?: number;
  avatar_group?: Array<{ group?: RawLineupCharacter[] }>;
};

export type LineupTeamMember = {
  id: number;
  name: string;
  icon: string;
  role: string | null;
};

export type LineupSuggestion = {
  id: string;
  title: string;
  likes: number;
  teams: LineupTeamMember[][];
  /** The focus character's gear in this lineup (for per-comp weapon/set usage). */
  focusWeapon: string | null;
  focusSets: string[];
  focusMainStats: { sands: string | null; goblet: string | null; circlet: string | null };
};

async function fetchLineupIndex(params: string, cookie?: string) {
  const response = await fetch(
    `${LINEUP_API}/lineup/index?next_page_token=&tag_id=&${params}&lang=en-us`,
    {
      headers: {
        "x-rpc-language": "en-us",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    },
  );
  const payload = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: { list?: RawLineup[] } | null;
  };
  if (payload.retcode !== 0) {
    throw new Error(payload.message ?? "Lineup API error");
  }
  return payload.data?.list ?? [];
}

function trimLineups(
  lineups: RawLineup[],
  focusId?: number,
): LineupSuggestion[] {
  return lineups
    .map((lineup) => {
      // Pull the focus character's gear from whichever team it appears in.
      let focusWeapon: string | null = null;
      let focusSets: string[] = [];
      const focusMainStats: LineupSuggestion["focusMainStats"] = {
        sands: null,
        goblet: null,
        circlet: null,
      };
      if (focusId) {
        for (const group of lineup.avatar_group ?? []) {
          const member = (group.group ?? []).find((m) => m.id === focusId);
          if (member) {
            focusWeapon = member.weapon?.name ?? null;
            focusSets = (member.set_list ?? [])
              .map((s) => s.name)
              .filter((n): n is string => Boolean(n));
            const slotByCat: Record<number, "sands" | "goblet" | "circlet"> = {
              3: "sands",
              4: "goblet",
              5: "circlet",
            };
            for (const attr of member.first_attr ?? []) {
              const slot = attr.cat_id ? slotByCat[attr.cat_id] : undefined;
              if (slot && attr.name) focusMainStats[slot] = displayStat(attr.name);
            }
            break;
          }
        }
      }
      return {
        id: lineup.id ?? "",
        title: lineup.title ?? "Untitled lineup",
        likes: lineup.like_cnt ?? 0,
        teams: (lineup.avatar_group ?? []).map((group) =>
          (group.group ?? [])
            .filter((member) => member.id && member.name)
            .map((member) => ({
              id: member.id as number,
              name: member.name as string,
              icon: member.head_icon || member.icon || "",
              role: member.avatar_tag?.name ?? null,
            })),
        ),
        focusWeapon,
        focusSets,
        focusMainStats,
      };
    })
    .filter((lineup) => lineup.teams.some((team) => team.length > 0));
}

/**
 * Team suggestions: HoYoLab's own account-matched ordering when it works
 * (needs a UID with visible characters), otherwise the hottest lineups.
 */
export async function fetchLineupSuggestions(options: {
  uid?: string;
  region?: string;
  cookie?: string;
}): Promise<{ source: "match" | "hot"; lineups: LineupSuggestion[] }> {
  if (options.uid && options.region) {
    try {
      const matched = await fetchLineupIndex(
        `limit=12&order=Match&roles=&uid=${options.uid}&region=${options.region}`,
        options.cookie,
      );
      if (matched.length > 0)
        return { source: "match", lineups: trimLineups(matched) };
    } catch {
      // fall through to Hot
    }
  }
  const hot = await fetchLineupIndex(`limit=12&order=Hot&roles=`);
  return { source: "hot", lineups: trimLineups(hot) };
}

export type ConsensusOption = { name: string; votes: number };

export type ConsensusBuild = {
  characterId: number;
  role: string | null;
  sampleSize: number;
  strategyUrl: string | null;
  weapons: Array<ConsensusOption & { rarity: number }>;
  sets: ConsensusOption[];
  mainStats: {
    sands: ConsensusOption[];
    goblet: ConsensusOption[];
    circlet: ConsensusOption[];
  };
  substats: string[];
};

/** Lineup stat names use e.g. "ATK Percentage"; display them as "ATK%". */
function displayStat(name: string) {
  return name.replace(/\s*Percentage$/i, "%");
}

export async function fetchCharacterLineups(
  characterId: number,
  limit = 20,
): Promise<RawLineup[]> {
  const url =
    `${LINEUP_API}/lineup/index?next_page_token=&limit=${limit}` +
    `&tag_id=&order=Hot&roles=${characterId}&lang=en-us`;
  const response = await fetch(url, {
    headers: { "x-rpc-language": "en-us" },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    retcode?: number;
    message?: string;
    data?: { list?: RawLineup[] } | null;
  };
  if (payload.retcode !== 0) {
    throw new Error(payload.message ?? "Lineup API error");
  }
  return payload.data?.list ?? [];
}

/** Top team comps that feature a character (for the guide's Teams section). */
export async function fetchCharacterTeams(
  characterId: number,
  limit = 20,
): Promise<LineupSuggestion[]> {
  return trimLineups(await fetchCharacterLineups(characterId, limit), characterId);
}

function tally(counts: Map<string, number>, key: string | undefined, by = 1) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + by);
}

function ranked(counts: Map<string, number>): ConsensusOption[] {
  return [...counts.entries()]
    .map(([name, votes]) => ({ name, votes }))
    .sort((a, b) => b.votes - a.votes);
}

export function aggregateLineups(
  characterId: number,
  lineups: RawLineup[],
): ConsensusBuild | null {
  const entries: RawLineupCharacter[] = [];
  for (const lineup of lineups) {
    for (const group of lineup.avatar_group ?? []) {
      for (const character of group.group ?? []) {
        if (character.id === characterId) entries.push(character);
      }
    }
  }
  if (entries.length === 0) return null;

  const weaponVotes = new Map<string, number>();
  const weaponRarity = new Map<string, number>();
  const setVotes = new Map<string, number>();
  const roleVotes = new Map<string, number>();
  const slotVotes = {
    sands: new Map<string, number>(),
    goblet: new Map<string, number>(),
    circlet: new Map<string, number>(),
  };
  const slotByCat: Record<number, keyof typeof slotVotes> = {
    3: "sands",
    4: "goblet",
    5: "circlet",
  };
  const substatScores = new Map<string, number>();
  let strategyUrl: string | null = null;

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
      // Borda count: earlier position = stronger priority.
      if (stat.name)
        tally(substatScores, displayStat(stat.name), substats.length - index);
    });
    if (!strategyUrl && entry.strategy_url) strategyUrl = entry.strategy_url;
  }

  return {
    characterId,
    role: ranked(roleVotes)[0]?.name ?? null,
    sampleSize: entries.length,
    strategyUrl,
    weapons: ranked(weaponVotes).map((option) => ({
      ...option,
      rarity: weaponRarity.get(option.name) ?? 4,
    })),
    sets: ranked(setVotes),
    mainStats: {
      sands: ranked(slotVotes.sands),
      goblet: ranked(slotVotes.goblet),
      circlet: ranked(slotVotes.circlet),
    },
    substats: ranked(substatScores)
      .slice(0, 5)
      .map((option) => option.name),
  };
}

/**
 * Adapt a consensus build to the BuildGuide shape so gradeBuild() can grade
 * against it. Talent and stat targets stay empty — the lineup data has none,
 * and gradeBuild skips them.
 */
export function consensusToGuide(consensus: ConsensusBuild): BuildGuide {
  const topSets = consensus.sets.slice(0, 2);
  return {
    character: "",
    role: consensus.role ?? "Community build",
    recommendedLevel: 90,
    weapons: consensus.weapons.slice(0, 4).map((weapon, index) => ({
      name: weapon.name,
      rarity: weapon.rarity,
      tier: index === 0 ? "BiS" : "Alt",
      stat: "",
      source: `${weapon.votes} of ${consensus.sampleSize} lineups`,
    })),
    artifactSets: topSets.map((set, index) => ({
      name: set.name,
      pieces: index === 0 ? 4 : 2,
      recommended: index === 0,
    })),
    mainStats: {
      sands: consensus.mainStats.sands.slice(0, 2).map((o) => o.name),
      goblet: consensus.mainStats.goblet.slice(0, 2).map((o) => o.name),
      circlet: consensus.mainStats.circlet.slice(0, 2).map((o) => o.name),
    },
    substatPriority: consensus.substats,
    talentTargets: { normal: 1, skill: 1, burst: 1 },
    statTargets: [],
  };
}

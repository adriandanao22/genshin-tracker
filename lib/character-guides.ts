/**
 * Reference guide data (skills, passives, constellations, portraits) for every
 * character, extracted from genshin-db into /gamedata/character-guides.json.
 * This is factual game data — the opinionated build layer lives in
 * lib/build-guides.ts and the live team comps come from HoYoLab lineups.
 */

export type GuideSkill = {
  slot: "normal" | "skill" | "burst" | "passive";
  name: string;
  description: string;
};

export type GuideConstellation = {
  level: number;
  name: string;
  description: string;
};

export type CharacterGuide = {
  name: string;
  rarity: number;
  element: string;
  region: string | null;
  weaponType: string | null;
  icon: string | null;
  portrait: string | null;
  skills: GuideSkill[];
  passives: GuideSkill[];
  constellations: GuideConstellation[];
};

export type CharacterGuideData = {
  extractedAt: string;
  characters: Record<string, CharacterGuide>;
};

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function iconUrl(filename: string | null | undefined): string | null {
  return filename ? `https://gi.yatta.moe/assets/UI/${filename}.png` : null;
}

let dataPromise: Promise<CharacterGuideData | null> | null = null;

/** Fetch (once per session) the static character-guide data. */
export function loadCharacterGuides(): Promise<CharacterGuideData | null> {
  dataPromise ??= fetch("/gamedata/character-guides.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return dataPromise;
}

export function findCharacterGuide(
  data: CharacterGuideData,
  characterName: string,
): CharacterGuide | null {
  const wanted = normalizeName(characterName);
  const direct = data.characters[wanted];
  if (direct) return direct;
  for (const [key, value] of Object.entries(data.characters)) {
    if (key.includes(wanted) || wanted.includes(key)) return value;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Team-comp naming — the community "<Main DPS> <Reaction>" convention */
/* ------------------------------------------------------------------ */

/**
 * The reaction/archetype a team runs, inferred from the elements present.
 * This mirrors how the community names comps ("Klee Overload", "Furina
 * Vaporize") — the reaction is implied by the element pairs on the team.
 */
// Keys are the two elements sorted alphabetically (see pairKey).
const REACTION_BY_PAIR: Record<string, string> = {
  "Hydro+Pyro": "Vaporize",
  "Cryo+Pyro": "Melt",
  "Electro+Pyro": "Overload",
  "Dendro+Pyro": "Burgeon",
  "Electro+Hydro": "Electro-Charged",
  "Dendro+Hydro": "Bloom",
  "Dendro+Electro": "Hyperbloom",
  "Cryo+Electro": "Superconduct",
  "Cryo+Hydro": "Freeze",
};

/** Order elements alphabetically so the pair key is stable. */
function pairKey(a: string, b: string) {
  return [a, b].sort().join("+");
}

/**
 * Derive a flavourful comp label like the community uses: the main DPS name
 * plus the dominant reaction the team's elements imply. Falls back to the
 * mono-element theme ("Mono Pyro") or just the DPS name.
 */
export function compArchetype(
  dpsName: string,
  dpsElement: string | null,
  memberElements: Array<string | null>,
): string {
  const elements = memberElements.filter(
    (e): e is string => Boolean(e) && e !== "Anemo" && e !== "Geo",
  );
  const unique = [...new Set(elements)];

  // Best reaction that involves the DPS's own element, if we know it.
  if (dpsElement && dpsElement !== "Anemo" && dpsElement !== "Geo") {
    for (const other of unique) {
      if (other === dpsElement) continue;
      const reaction = REACTION_BY_PAIR[pairKey(dpsElement, other)];
      if (reaction) return `${dpsName} ${reaction}`;
    }
    // Mono-element team (everyone shares the DPS element).
    if (unique.length === 1 && unique[0] === dpsElement) {
      return `Mono ${dpsElement} ${dpsName}`;
    }
  }

  // No DPS element known — take any reaction the team can make.
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const reaction = REACTION_BY_PAIR[pairKey(unique[i], unique[j])];
      if (reaction) return `${dpsName} ${reaction}`;
    }
  }

  return dpsName;
}

/* ------------------------------------------------------------------ */
/* Group a character's lineups into named archetype comps              */
/* ------------------------------------------------------------------ */

type LineupLike = {
  id: string;
  title: string;
  likes: number;
  teams: Array<Array<{ id: number; name: string; icon: string; role: string | null }>>;
};

export type ArchetypeEntry<L extends LineupLike> = {
  lineup: L;
  members: L["teams"][number];
};

export type ArchetypeGroup<L extends LineupLike> = {
  label: string;
  entries: Array<ArchetypeEntry<L>>;
};

/**
 * Bucket a focus character's lineups into "<Main DPS> <Reaction>" comps, each
 * sorted by likes and capped. Shared by the character modal and Team Planner
 * so both label comps identically.
 */
export function groupTeamsByArchetype<L extends LineupLike>(
  teams: L[],
  focusId: number,
  elementOf: (name: string) => string | null,
  options: { maxGroups?: number; maxPerGroup?: number } = {},
): Array<ArchetypeGroup<L>> {
  const { maxGroups = 6, maxPerGroup = 4 } = options;
  const groups = new Map<string, Array<ArchetypeEntry<L>>>();
  for (const lineup of teams) {
    const members = lineup.teams.find(
      (team) => team.length <= 5 && team.some((m) => m.id === focusId),
    );
    if (!members) continue;
    const dps =
      members.find(
        (m) => /dps/i.test(m.role ?? "") && !/sub/i.test(m.role ?? ""),
      ) ??
      members.find((m) => /dps/i.test(m.role ?? "")) ??
      members.find((m) => m.id !== focusId) ??
      members[0];
    const label = dps
      ? compArchetype(
          dps.name,
          elementOf(dps.name),
          members.map((m) => elementOf(m.name)),
        )
      : "Flex";
    const list = groups.get(label) ?? [];
    list.push({ lineup, members });
    groups.set(label, list);
  }
  return [...groups.entries()]
    .map(([label, entries]) => ({
      label,
      entries: entries
        .sort((a, b) => b.lineup.likes - a.lineup.likes)
        .slice(0, maxPerGroup),
    }))
    .sort(
      (a, b) =>
        (b.entries[0]?.lineup.likes ?? 0) - (a.entries[0]?.lineup.likes ?? 0),
    )
    .slice(0, maxGroups);
}

/**
 * Client-side farming math over the static game data extracted from
 * genshin-db (public/gamedata/farming.json — see scripts/extract-game-data.mjs).
 */
import { domainForBook } from "@/lib/talent-domains";

export type CostItem = { name: string; count: number };

export type FarmingCharacter = {
  name: string;
  rarity: number;
  element: string;
  region: string | null;
  weaponType: string | null;
  icon: string | null;
  book: string | null;
  bookDays: string[] | null;
  bookDomain: string | null;
  weekly: string | null;
  weeklyBoss: string | null;
  weeklyBossIcon: string | null;
  boss: string | null;
  bossSource: string | null;
  bossIcon: string | null;
  specialty: string | null;
  common: string | null;
  gem: string | null;
  talentCosts: Record<string, CostItem[]>;
  ascensionCosts: Record<string, CostItem[]>;
};

export type MaterialMeta = {
  kind: string;
  days: string[] | null;
  domain: string | null;
  rarity: number | null;
  icon: string | null;
};

/**
 * Build a UI icon URL from a genshin-db filename (e.g. "UI_ItemIcon_202").
 * Uses Project Amber (yatta.moe), which stays current with new patches —
 * enka.network lags behind on recently added materials.
 */
export function iconUrl(filename: string | null | undefined): string | null {
  return filename ? `https://gi.yatta.moe/assets/UI/${filename}.png` : null;
}

/** Boss/enemy portraits live under a different path on the same CDN. */
export function monsterIconUrl(filename: string | null | undefined): string | null {
  return filename
    ? `https://gi.yatta.moe/assets/UI/monster/${filename}.png`
    : null;
}

/** Strip the tier prefix from a talent book to get its series ("Ballad"). */
export function bookSeries(name: string): string {
  return name.replace(/^(Teachings of|Guide to|Philosophies of)\s+/i, "");
}

export type FarmingData = {
  extractedAt: string;
  characters: Record<string, FarmingCharacter>;
  materials: Record<string, MaterialMeta>;
};

export type PlanTargets = {
  level: number;
  normal: number;
  skill: number;
  burst: number;
};

export const DEFAULT_TARGETS: PlanTargets = {
  level: 90,
  normal: 6,
  skill: 9,
  burst: 9,
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

let dataPromise: Promise<FarmingData | null> | null = null;

/** Fetch (once per session) the static farming data. */
export function loadFarmingData(): Promise<FarmingData | null> {
  dataPromise ??= fetch("/gamedata/farming.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return dataPromise;
}

export function findFarmingCharacter(
  data: FarmingData,
  characterName: string,
): FarmingCharacter | null {
  const wanted = normalize(characterName);
  const direct = data.characters[wanted];
  if (direct) return direct;
  for (const [key, value] of Object.entries(data.characters)) {
    if (key.includes(wanted) || wanted.includes(key)) return value;
  }
  return null;
}

/* ---------------- Server time ---------------- */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SERVER_UTC_OFFSET: Record<string, number> = {
  America: -5,
  Europe: 1,
  Asia: 8,
  "TW, HK, MO": 8,
};

/** Current weekday on the game server (daily reset at 4 AM server time). */
export function serverWeekday(server: string, at = new Date()): string {
  const offset = SERVER_UTC_OFFSET[server] ?? -5;
  const serverMs = at.getTime() + (offset - 4) * 3600 * 1000;
  const day = new Date(serverMs).getUTCDay();
  return WEEKDAYS[day];
}

/* ---------------- Material math ---------------- */

const ASCENSION_THRESHOLDS = [20, 40, 50, 60, 70, 80];

const KIND_ORDER = [
  "mora",
  "book",
  "weekly",
  "boss",
  "gem",
  "weaponAscension",
  "specialty",
  "common",
  "crown",
  "other",
];

export type RemainingItem = CostItem & { kind: string; icon: string | null };

/**
 * Weapon ascension materials still owed to raise a weapon from currentLevel to
 * targetLevel. Costs are keyed "1".."6" per ascension phase (see
 * build-assets.json). Material metadata (icon/kind) comes from the shared map.
 */
export function weaponRemaining(
  costs: Record<string, CostItem[]>,
  materials: Record<string, MaterialMeta>,
  currentLevel: number,
  targetLevel: number,
): RemainingItem[] {
  const totals = new Map<string, number>();
  ASCENSION_THRESHOLDS.forEach((threshold, index) => {
    if (threshold >= currentLevel && threshold < targetLevel) {
      for (const item of costs[String(index + 1)] ?? [])
        totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
    }
  });
  return [...totals.entries()]
    .map(([name, count]) => ({
      name,
      count,
      kind: materials[name]?.kind ?? (name === "Mora" ? "mora" : "other"),
      icon: materials[name]?.icon ?? null,
    }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/**
 * Everything still owed to reach the targets, aggregated across ascension
 * phases and all three combat talents.
 */
export function remainingMaterials(
  character: FarmingCharacter,
  materials: Record<string, MaterialMeta>,
  currentLevel: number,
  currentTalents: { normal: number; skill: number; burst: number },
  targets: PlanTargets,
  owned?: Record<string, number>,
): RemainingItem[] {
  const totals = new Map<string, number>();
  const add = (item: CostItem) =>
    totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);

  ASCENSION_THRESHOLDS.forEach((threshold, index) => {
    if (threshold >= currentLevel && threshold < targets.level) {
      for (const item of character.ascensionCosts[String(index + 1)] ?? [])
        add(item);
    }
  });

  for (const [current, target] of [
    [currentTalents.normal, targets.normal],
    [currentTalents.skill, targets.skill],
    [currentTalents.burst, targets.burst],
  ]) {
    for (let level = current + 1; level <= target; level += 1) {
      for (const item of character.talentCosts[String(level)] ?? []) add(item);
    }
  }

  return [...totals.entries()]
    .map(([name, count]) => ({
      name,
      // Subtract what the player already owns (imported inventory), if any.
      count: owned ? Math.max(0, count - (owned[normalize(name)] ?? 0)) : count,
      kind: materials[name]?.kind ?? (name === "Mora" ? "mora" : "other"),
      icon: materials[name]?.icon ?? null,
    }))
    .filter((item) => item.count > 0)
    .sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
}

/* ---------------- Aggregated farming plan (Overview) ---------------- */

export type PlanEntry = {
  id: number;
  name: string;
  icon: string | null;
  element: string;
  farming: FarmingCharacter;
  currentLevel: number;
  currentTalents: { normal: number; skill: number; burst: number };
  targets: PlanTargets;
};

export type CharacterPlan = PlanEntry & {
  remaining: RemainingItem[];
  formableToday: boolean;
};

export type SourceContributor = {
  name: string;
  icon: string | null;
  count: number;
};

export type DomainBookItem = {
  name: string;
  icon: string | null;
  count: number;
  rarity: number;
};

/** One talent-book series needed at a domain (e.g. "Ballad"), broken down
 *  into its individual tier items and which characters need them. */
export type DomainSeries = {
  name: string;
  items: DomainBookItem[];
  total: number;
  contributors: SourceContributor[];
};

export type DomainPlan = {
  location: string;
  region: string | null;
  slug: string | null;
  days: string[];
  series: DomainSeries[];
  total: number;
};

export type BossPlan = {
  boss: string;
  bossIcon: string | null;
  material: string;
  icon: string | null;
  total: number;
  contributors: SourceContributor[];
};

export type FarmingPlan = {
  totalMora: number;
  characters: CharacterPlan[];
  domains: DomainPlan[];
  weeklyBosses: BossPlan[];
};

export function buildFarmingPlan(
  entries: PlanEntry[],
  materials: Record<string, MaterialMeta>,
  day: string,
  today: string = day,
  owned?: Record<string, number>,
): FarmingPlan {
  const characters: CharacterPlan[] = entries.map((entry) => ({
    ...entry,
    remaining: remainingMaterials(
      entry.farming,
      materials,
      entry.currentLevel,
      entry.currentTalents,
      entry.targets,
      owned,
    ),
    formableToday: entry.farming.bookDays?.includes(today) ?? false,
  }));

  let totalMora = 0;
  const domains = new Map<string, DomainPlan>();
  const bosses = new Map<string, BossPlan>();

  for (const plan of characters) {
    const bookTotal = plan.remaining
      .filter((item) => item.kind === "book")
      .reduce((sum, item) => sum + item.count, 0);
    const weeklyTotal = plan.remaining
      .filter((item) => item.kind === "weekly")
      .reduce((sum, item) => sum + item.count, 0);

    for (const item of plan.remaining) {
      if (item.kind === "mora") totalMora += item.count;
    }

    // Group by physical domain location; only count series that drop on `day`.
    const dropsToday = plan.farming.bookDays?.includes(day) ?? false;
    if (plan.farming.book && bookTotal > 0 && dropsToday) {
      const domain = domainForBook(plan.farming.book);
      const key =
        domain?.location ??
        plan.farming.bookDomain?.replace(/^Domain of \w+: /, "") ??
        plan.farming.book;
      const group =
        domains.get(key) ??
        {
          location: key,
          region: domain?.region ?? plan.farming.region ?? null,
          slug: domain?.slug ?? null,
          days: [],
          series: [],
          total: 0,
        };
      group.total += bookTotal;

      // Each character needs exactly one book series — merge its per-tier
      // book items into that series and record the character as a contributor.
      const seriesName = bookSeries(plan.farming.book);
      let series = group.series.find((s) => s.name === seriesName);
      if (!series) {
        series = { name: seriesName, items: [], total: 0, contributors: [] };
        group.series.push(series);
      }
      series.total += bookTotal;
      for (const item of plan.remaining) {
        if (item.kind !== "book") continue;
        const existing = series.items.find((i) => i.name === item.name);
        if (existing) existing.count += item.count;
        else
          series.items.push({
            name: item.name,
            icon: item.icon,
            count: item.count,
            rarity: materials[item.name]?.rarity ?? 0,
          });
      }
      series.contributors.push({
        name: plan.name,
        icon: plan.icon,
        count: bookTotal,
      });

      for (const dd of plan.farming.bookDays ?? [])
        if (!group.days.includes(dd)) group.days.push(dd);
      domains.set(key, group);
    }

    if (plan.farming.weeklyBoss && plan.farming.weekly && weeklyTotal > 0) {
      const key = plan.farming.weeklyBoss;
      const group =
        bosses.get(key) ??
        {
          boss: plan.farming.weeklyBoss,
          bossIcon: plan.farming.weeklyBossIcon ?? null,
          material: plan.farming.weekly,
          icon: materials[plan.farming.weekly]?.icon ?? null,
          total: 0,
          contributors: [],
        };
      group.total += weeklyTotal;
      group.contributors.push({
        name: plan.name,
        icon: plan.icon,
        count: weeklyTotal,
      });
      bosses.set(key, group);
    }
  }

  const bySize = (a: { total: number }, b: { total: number }) =>
    b.total - a.total;
  const domainList = [...domains.values()].sort(bySize);
  for (const domain of domainList) {
    domain.series.sort(bySize);
    for (const series of domain.series)
      series.items.sort((a, b) => a.rarity - b.rarity);
  }
  return {
    totalMora,
    characters,
    domains: domainList,
    weeklyBosses: [...bosses.values()].sort(bySize),
  };
}

export function formatCount(count: number) {
  if (count >= 1_000_000)
    return `${(count / 1_000_000).toFixed(count % 1_000_000 ? 1 : 0)}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}K`;
  return count.toLocaleString();
}

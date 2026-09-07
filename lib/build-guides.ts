import type { CharacterDetail } from "@/lib/hoyolab-game-record";

/**
 * Build guide schema + grading engine.
 *
 * A guide describes the recommended build for one character; gradeBuild()
 * compares a player's real HoYoLab build against it. The guides below are
 * SAMPLE content (common community consensus) — replace them with the real
 * guide source when it's decided. Names must match HoYoLab's English names
 * exactly for weapon/set detection to work.
 */

export type GuideWeapon = {
  name: string;
  rarity: number;
  tier: "BiS" | "Alt" | "F2P";
  stat: string;
  source: string;
  refinement?: number;
};

export type GuideArtifactSet = {
  name: string;
  pieces: 2 | 4;
  recommended?: boolean;
};

export type StatTarget = {
  /** Matched against HoYoLab stat names, case-insensitive substring. */
  stat: string;
  min: number;
  note?: string;
};

export type BuildGuide = {
  character: string;
  role: string;
  recommendedLevel: number;
  weapons: GuideWeapon[];
  artifactSets: GuideArtifactSet[];
  mainStats: { sands: string[]; goblet: string[]; circlet: string[] };
  substatPriority: string[];
  talentTargets: { normal: number; skill: number; burst: number };
  talentNote?: string;
  statTargets: StatTarget[];
};

/* ------------------------------------------------------------------ */
/* SAMPLE GUIDES — placeholder content until the real source is wired  */
/* ------------------------------------------------------------------ */

export const buildGuides: BuildGuide[] = [
  {
    character: "Furina",
    role: "Off-field Sub DPS / Support",
    recommendedLevel: 90,
    weapons: [
      { name: "Splendor of Tranquil Waters", rarity: 5, tier: "BiS", stat: "CRIT DMG", source: "Wish" },
      { name: "Festering Desire", rarity: 4, tier: "Alt", stat: "Energy Recharge", source: "Event", refinement: 5 },
      { name: "Fleuve Cendre Ferryman", rarity: 4, tier: "F2P", stat: "Energy Recharge", source: "Fishing", refinement: 5 },
      { name: "Favonius Sword", rarity: 4, tier: "F2P", stat: "Energy Recharge", source: "Wish" },
    ],
    artifactSets: [{ name: "Golden Troupe", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["HP", "Energy Recharge"],
      goblet: ["HP"],
      circlet: ["CRIT Rate", "CRIT DMG", "HP"],
    },
    substatPriority: ["Energy Recharge", "CRIT Rate", "CRIT DMG", "HP"],
    talentTargets: { normal: 1, skill: 10, burst: 9 },
    talentNote: "Skill first, then Burst. Normal attacks stay at 1.",
    statTargets: [
      { stat: "Max HP", min: 28000, note: "33,000+ is the comfortable range" },
      { stat: "Energy Recharge", min: 160, note: "180–220% depending on team" },
      { stat: "CRIT Rate", min: 50 },
    ],
  },
  {
    character: "Kaedehara Kazuha",
    role: "Anemo Support / Grouper",
    recommendedLevel: 90,
    weapons: [
      { name: "Freedom-Sworn", rarity: 5, tier: "BiS", stat: "Elemental Mastery", source: "Wish" },
      { name: "Iron Sting", rarity: 4, tier: "F2P", stat: "Elemental Mastery", source: "Craftable", refinement: 5 },
      { name: "Favonius Sword", rarity: 4, tier: "Alt", stat: "Energy Recharge", source: "Wish" },
    ],
    artifactSets: [{ name: "Viridescent Venerer", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["Elemental Mastery"],
      goblet: ["Elemental Mastery"],
      circlet: ["Elemental Mastery"],
    },
    substatPriority: ["Elemental Mastery", "Energy Recharge"],
    talentTargets: { normal: 1, skill: 9, burst: 9 },
    statTargets: [
      { stat: "Elemental Mastery", min: 800, note: "Every point buffs the team" },
      { stat: "Energy Recharge", min: 160 },
    ],
  },
  {
    character: "Raiden Shogun",
    role: "Off-field DPS / Battery",
    recommendedLevel: 90,
    weapons: [
      { name: "Engulfing Lightning", rarity: 5, tier: "BiS", stat: "Energy Recharge", source: "Wish" },
      { name: "The Catch", rarity: 4, tier: "F2P", stat: "Energy Recharge", source: "Fishing", refinement: 5 },
      { name: "Favonius Lance", rarity: 4, tier: "Alt", stat: "Energy Recharge", source: "Wish" },
    ],
    artifactSets: [{ name: "Emblem of Severed Fate", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["Energy Recharge", "ATK"],
      goblet: ["Electro DMG Bonus", "ATK"],
      circlet: ["CRIT Rate", "CRIT DMG"],
    },
    substatPriority: ["Energy Recharge", "CRIT Rate", "CRIT DMG", "ATK"],
    talentTargets: { normal: 1, skill: 9, burst: 10 },
    talentNote: "Burst is everything — level it first.",
    statTargets: [
      { stat: "Energy Recharge", min: 200, note: "220–270% for Emblem scaling" },
      { stat: "CRIT Rate", min: 55 },
      { stat: "CRIT DMG", min: 110 },
    ],
  },
  {
    character: "Nahida",
    role: "Off-field Dendro Applier",
    recommendedLevel: 90,
    weapons: [
      { name: "A Thousand Floating Dreams", rarity: 5, tier: "BiS", stat: "Elemental Mastery", source: "Wish" },
      { name: "Sacrificial Fragments", rarity: 4, tier: "Alt", stat: "Elemental Mastery", source: "Wish" },
      { name: "Magic Guide", rarity: 3, tier: "F2P", stat: "Elemental Mastery", source: "Wish" },
    ],
    artifactSets: [{ name: "Deepwood Memories", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["Elemental Mastery"],
      goblet: ["Elemental Mastery", "Dendro DMG Bonus"],
      circlet: ["Elemental Mastery", "CRIT Rate", "CRIT DMG"],
    },
    substatPriority: ["Elemental Mastery", "CRIT Rate", "CRIT DMG", "Energy Recharge"],
    talentTargets: { normal: 1, skill: 10, burst: 9 },
    statTargets: [
      { stat: "Elemental Mastery", min: 750, note: "1000 caps her A1 buff" },
    ],
  },
  {
    character: "Bennett",
    role: "Healer / ATK Buffer",
    recommendedLevel: 90,
    weapons: [
      { name: "Aquila Favonia", rarity: 5, tier: "BiS", stat: "Physical DMG Bonus", source: "Wish" },
      { name: "Festering Desire", rarity: 4, tier: "Alt", stat: "Energy Recharge", source: "Event", refinement: 5 },
      { name: "Favonius Sword", rarity: 4, tier: "F2P", stat: "Energy Recharge", source: "Wish" },
    ],
    artifactSets: [{ name: "Noblesse Oblige", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["Energy Recharge", "HP"],
      goblet: ["HP"],
      circlet: ["Healing Bonus", "HP"],
    },
    substatPriority: ["Energy Recharge", "HP"],
    talentTargets: { normal: 1, skill: 6, burst: 10 },
    talentNote: "Burst 10+ — the ATK buff scales with it.",
    statTargets: [
      { stat: "Max HP", min: 25000, note: "Heals scale off HP" },
      { stat: "Energy Recharge", min: 180 },
    ],
  },
  {
    character: "Xiangling",
    role: "Off-field Pyro DPS",
    recommendedLevel: 90,
    weapons: [
      { name: "Engulfing Lightning", rarity: 5, tier: "Alt", stat: "Energy Recharge", source: "Wish" },
      { name: "The Catch", rarity: 4, tier: "BiS", stat: "Energy Recharge", source: "Fishing", refinement: 5 },
      { name: "Favonius Lance", rarity: 4, tier: "F2P", stat: "Energy Recharge", source: "Wish" },
    ],
    artifactSets: [{ name: "Emblem of Severed Fate", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["Energy Recharge", "ATK", "Elemental Mastery"],
      goblet: ["Pyro DMG Bonus"],
      circlet: ["CRIT Rate", "CRIT DMG"],
    },
    substatPriority: ["Energy Recharge", "CRIT Rate", "CRIT DMG", "ATK", "Elemental Mastery"],
    talentTargets: { normal: 1, skill: 6, burst: 10 },
    statTargets: [
      { stat: "Energy Recharge", min: 200, note: "Pyronado is hungry" },
      { stat: "CRIT Rate", min: 55 },
    ],
  },
  {
    character: "Neuvillette",
    role: "On-field Hydro DPS",
    recommendedLevel: 90,
    weapons: [
      { name: "Tome of the Eternal Flow", rarity: 5, tier: "BiS", stat: "CRIT DMG", source: "Wish" },
      { name: "Prototype Amber", rarity: 4, tier: "F2P", stat: "HP", source: "Craftable", refinement: 5 },
      { name: "The Widsith", rarity: 4, tier: "Alt", stat: "CRIT DMG", source: "Wish" },
    ],
    artifactSets: [{ name: "Marechaussee Hunter", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["HP"],
      goblet: ["Hydro DMG Bonus"],
      circlet: ["CRIT Rate", "CRIT DMG"],
    },
    substatPriority: ["CRIT Rate", "CRIT DMG", "HP", "Energy Recharge"],
    talentTargets: { normal: 10, skill: 9, burst: 9 },
    talentNote: "Charged Attack (Normal) first — it's his whole kit.",
    statTargets: [
      { stat: "Max HP", min: 30000 },
      { stat: "CRIT Rate", min: 40, note: "Marechaussee stacks add up to 36%" },
      { stat: "CRIT DMG", min: 140 },
    ],
  },
  {
    character: "Mualani",
    role: "On-field Hydro DPS",
    recommendedLevel: 90,
    weapons: [
      { name: "Surf's Up", rarity: 5, tier: "BiS", stat: "CRIT DMG", source: "Wish" },
      { name: "Ring of Yaxche", rarity: 4, tier: "F2P", stat: "HP", source: "Wish" },
      { name: "Flowing Purity", rarity: 4, tier: "Alt", stat: "HP", source: "Battle Pass" },
    ],
    artifactSets: [{ name: "Obsidian Codex", pieces: 4, recommended: true }],
    mainStats: {
      sands: ["HP"],
      goblet: ["HP", "Hydro DMG Bonus"],
      circlet: ["CRIT Rate", "CRIT DMG"],
    },
    substatPriority: ["CRIT Rate", "CRIT DMG", "HP"],
    talentTargets: { normal: 10, skill: 9, burst: 6 },
    statTargets: [
      { stat: "Max HP", min: 33000 },
      { stat: "CRIT Rate", min: 60 },
      { stat: "CRIT DMG", min: 130 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Matching & grading                                                  */
/* ------------------------------------------------------------------ */

export type CheckStatus = "pass" | "warn" | "fail";
export type GuideCheck = { label: string; status: CheckStatus; detail: string };

function normalize(value: string) {
  return value.toLowerCase().replace(/[%\s'’\-]/g, "");
}

export function findGuide(characterName: string): BuildGuide | null {
  const wanted = normalize(characterName);
  return (
    buildGuides.find((guide) => {
      const name = normalize(guide.character);
      return name === wanted || name.includes(wanted) || wanted.includes(name);
    }) ?? null
  );
}

function parseStatValue(value: string) {
  const parsed = Number.parseFloat(value.replace(/[,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function checkMainStat(
  label: string,
  slotName: string,
  allowed: string[],
  detail: CharacterDetail,
  slot: number,
): GuideCheck {
  const artifact = detail.artifacts.find((item) => item.slot === slot);
  if (!artifact) {
    return { label, status: "fail", detail: `No ${slotName} equipped` };
  }
  const current = normalize(artifact.mainStat.name);
  const match = allowed.some(
    (option) =>
      normalize(option) === current ||
      current.includes(normalize(option)) ||
      normalize(option).includes(current),
  );
  return match
    ? { label, status: "pass", detail: artifact.mainStat.name }
    : {
        label,
        status: "fail",
        detail: `${artifact.mainStat.name} — guide wants ${allowed.join(" / ")}`,
      };
}

export function gradeBuild(
  guide: BuildGuide,
  detail: CharacterDetail,
): GuideCheck[] {
  const checks: GuideCheck[] = [];

  // Level
  checks.push(
    detail.level >= guide.recommendedLevel
      ? {
          label: "Level",
          status: "pass",
          detail: `Lv ${detail.level} — at the recommended level`,
        }
      : {
          label: "Level",
          status: "warn",
          detail: `Lv ${detail.level} → aim for Lv ${guide.recommendedLevel}`,
        },
  );

  // Weapon
  const equipped = detail.weaponDetail;
  if (guide.weapons.length === 0) {
    // No weapon preference (e.g. a plan without a chosen weapon) — skip.
  } else if (!equipped) {
    checks.push({ label: "Weapon", status: "fail", detail: "Nothing equipped" });
  } else {
    const match = guide.weapons.find(
      (weapon) => normalize(weapon.name) === normalize(equipped.name),
    );
    if (match) {
      const refinementNote =
        match.refinement && equipped.refinement < match.refinement
          ? ` — worth refining to R${match.refinement} (yours is R${equipped.refinement})`
          : "";
      checks.push({
        label: "Weapon",
        status: "pass",
        detail: `${equipped.name} (${match.tier} pick)${refinementNote}`,
      });
    } else {
      checks.push({
        label: "Weapon",
        status: "warn",
        detail: `${equipped.name} isn't in the guide — BiS is ${guide.weapons[0].name}`,
      });
    }
  }

  // Artifact set
  const pieceCounts = new Map<string, number>();
  for (const artifact of detail.artifacts) {
    if (!artifact.setName) continue;
    pieceCounts.set(
      artifact.setName,
      (pieceCounts.get(artifact.setName) ?? 0) + 1,
    );
  }
  const recommendedSets = guide.artifactSets.filter((set) => set.recommended);
  const fourPiece = guide.artifactSets.find(
    (set) =>
      set.pieces === 4 &&
      [...pieceCounts.entries()].some(
        ([name, count]) =>
          normalize(name) === normalize(set.name) && count >= 4,
      ),
  );
  if (guide.artifactSets.length === 0) {
    // No set preference — skip.
  } else if (fourPiece) {
    checks.push({
      label: "Artifact set",
      status: "pass",
      detail: `4pc ${fourPiece.name}`,
    });
  } else {
    const partial = guide.artifactSets.find((set) =>
      [...pieceCounts.entries()].some(
        ([name, count]) =>
          normalize(name) === normalize(set.name) && count >= 2,
      ),
    );
    const wanted = (recommendedSets[0] ?? guide.artifactSets[0])?.name;
    checks.push(
      partial
        ? {
            label: "Artifact set",
            status: "warn",
            detail: `Only 2pc ${partial.name} — finish the 4pc ${wanted}`,
          }
        : {
            label: "Artifact set",
            status: "fail",
            detail: `Off-set — guide wants 4pc ${wanted}`,
          },
    );
  }

  // Main stats (slots: 3 sands, 4 goblet, 5 circlet)
  if (guide.mainStats.sands.length > 0)
    checks.push(checkMainStat("Sands", "Sands", guide.mainStats.sands, detail, 3));
  if (guide.mainStats.goblet.length > 0)
    checks.push(
      checkMainStat("Goblet", "Goblet", guide.mainStats.goblet, detail, 4),
    );
  if (guide.mainStats.circlet.length > 0)
    checks.push(
      checkMainStat("Circlet", "Circlet", guide.mainStats.circlet, detail, 5),
    );

  // Talents — combat talents come back in normal / skill / burst order
  const combat = detail.talents.filter((talent) => talent.type === 1);
  const targets = [
    { label: "Normal Attack", target: guide.talentTargets.normal },
    { label: "Skill", target: guide.talentTargets.skill },
    { label: "Burst", target: guide.talentTargets.burst },
  ];
  targets.forEach((entry, index) => {
    const talent = combat[index];
    if (!talent || entry.target <= 1) return;
    checks.push(
      talent.level >= entry.target
        ? {
            label: entry.label,
            status: "pass",
            detail: `Lv ${talent.level} (target ${entry.target})`,
          }
        : {
            label: entry.label,
            status: talent.level >= entry.target - 2 ? "warn" : "fail",
            detail: `Lv ${talent.level} → raise to ${entry.target}`,
          },
    );
  });

  // Stat targets
  for (const target of guide.statTargets) {
    const stat = detail.stats.find((entry) =>
      normalize(entry.name).includes(normalize(target.stat)),
    );
    if (!stat) continue;
    const value = parseStatValue(stat.final);
    if (value === null) continue;
    const display = `${stat.final} (target ${target.min.toLocaleString()}${stat.final.includes("%") ? "%" : ""})`;
    checks.push(
      value >= target.min
        ? { label: target.stat, status: "pass", detail: display }
        : {
            label: target.stat,
            status: value >= target.min * 0.85 ? "warn" : "fail",
            detail: target.note ? `${display} — ${target.note}` : display,
          },
    );
  }

  return checks;
}

/**
 * Artifact + build grading.
 *
 * Artifacts are scored by ROLL VALUE — each substat's value as a fraction of
 * its highest possible single roll — weighted by how much the character wants
 * that substat (from the guide's substat priority; crit is always valued).
 * Efficiency = weighted rolls ÷ the rolls the artifact has had, so a low-level
 * piece isn't judged as if it were maxed. We also surface Crit Value (CV),
 * the community's quick quality proxy: 2·CRIT Rate + CRIT DMG.
 */
import type { CharacterArtifact, CharacterDetail } from "@/lib/hoyolab-game-record";
import type { BuildGuide, GuideCheck } from "@/lib/build-guides";

// Highest single-roll value per substat on a 5★ artifact.
const MAX_ROLL_5: Record<string, number> = {
  "HP": 298.75,
  "ATK": 19.45,
  "DEF": 23.15,
  "HP%": 5.83,
  "ATK%": 5.83,
  "DEF%": 7.29,
  "Elemental Mastery": 23.31,
  "Energy Recharge": 6.48,
  "CRIT Rate": 3.89,
  "CRIT DMG": 7.77,
};

// 4★ rolls are ~80% of a 5★; anything lower is rough but rarely graded.
function rarityFactor(rarity: number) {
  return rarity >= 5 ? 1 : rarity === 4 ? 0.78 : 0.6;
}

/** Resolve HoYoLAB's substat name (+ % vs flat) to a canonical key. */
export function canonicalSubstat(name: string, value: string): string {
  const isPct = value.includes("%");
  const n = name.trim();
  if (/^HP%?$/i.test(n)) return isPct ? "HP%" : "HP";
  if (/^ATK%?$/i.test(n)) return isPct ? "ATK%" : "ATK";
  if (/^DEF%?$/i.test(n)) return isPct ? "DEF%" : "DEF";
  if (/elemental\s*mastery/i.test(n)) return "Elemental Mastery";
  if (/energy\s*recharge/i.test(n)) return "Energy Recharge";
  if (/crit\s*rate|crit\s*chance/i.test(n)) return "CRIT Rate";
  if (/crit\s*dmg|crit\s*damage/i.test(n)) return "CRIT DMG";
  return n;
}

export function parseStatValue(value: string): number {
  const n = Number.parseFloat(value.replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Per-substat relevance weights (0–1) for a character. Crit is always valued;
 * substats named in the guide's priority are valued; flat stats barely count.
 */
export function substatWeights(guide: BuildGuide | null): Record<string, number> {
  const base: Record<string, number> = {
    "CRIT Rate": 1,
    "CRIT DMG": 1,
    "ATK%": 0.6,
    "HP%": 0.4,
    "DEF%": 0.3,
    "Elemental Mastery": 0.5,
    "Energy Recharge": 0.5,
    "HP": 0.1,
    "ATK": 0.1,
    "DEF": 0.1,
  };
  if (!guide || guide.substatPriority.length === 0) {
    // No guide — assume an offensive %-stat build so the number is still useful.
    return { ...base, "ATK%": 0.8, "HP%": 0.7, "Energy Recharge": 0.6 };
  }
  const weights = { ...base };
  guide.substatPriority.forEach((raw) => {
    const key = normalize(raw);
    for (const stat of Object.keys(base)) {
      // Match "HP" priority to HP%, "ATK" to ATK%, etc. (guides mean the % one).
      if (normalize(stat) === key || normalize(stat) === key + "" || normalize(stat).startsWith(key)) {
        weights[stat] = 1;
      }
    }
  });
  return weights;
}

export type PieceGrade = {
  slot: number;
  slotName: string;
  cv: number;
  rolls: number; // weighted roll value
  expected: number;
  efficiency: number; // 0–1
  grade: Letter;
  mainOk: boolean | null; // vs guide's wanted main stat, null if unknown
  topSubs: string[]; // relevant substats present
};

export type Letter = "S" | "A" | "B" | "C" | "D";

// Artifact roll quality realistically tops out well below 1.0, so this ramp is
// tuned for substat efficiency (used for pieces and the artifacts average).
function letterArtifact(eff: number): Letter {
  if (eff >= 0.7) return "S";
  if (eff >= 0.55) return "A";
  if (eff >= 0.4) return "B";
  if (eff >= 0.25) return "C";
  return "D";
}

// A finished build passes most guide checks, so the build ramp is stricter.
function letterBuild(score: number): Letter {
  if (score >= 0.9) return "S";
  if (score >= 0.78) return "A";
  if (score >= 0.65) return "B";
  if (score >= 0.5) return "C";
  return "D";
}

const SLOT_STAT_KEY = { 3: "sands", 4: "goblet", 5: "circlet" } as const;

export function gradePiece(
  artifact: CharacterArtifact,
  weights: Record<string, number>,
  guide: BuildGuide | null,
): PieceGrade {
  const factor = rarityFactor(artifact.rarity);
  let weightedRolls = 0;
  let cv = 0;
  const topSubs: string[] = [];
  for (const sub of artifact.subStats) {
    const key = canonicalSubstat(sub.name, sub.value);
    const val = parseStatValue(sub.value);
    if (key === "CRIT Rate") cv += val * 2;
    if (key === "CRIT DMG") cv += val;
    const maxRoll = (MAX_ROLL_5[key] ?? 0) * factor;
    if (maxRoll > 0) {
      const rv = val / maxRoll; // ≈ number of max-rolls this substat represents
      const w = weights[key] ?? 0.2;
      weightedRolls += rv * w;
      if (w >= 0.5) topSubs.push(key);
    }
  }
  // Rolls the artifact has had: 4 initial substats + one per 4 levels.
  const expected = 4 + Math.floor(artifact.level / 4);
  const efficiency = Math.min(1, expected > 0 ? weightedRolls / expected : 0);

  // Main stat vs the guide's wanted stat for this slot.
  let mainOk: boolean | null = null;
  const slotKey = SLOT_STAT_KEY[artifact.slot as 3 | 4 | 5];
  if (slotKey && guide) {
    const wanted = guide.mainStats[slotKey];
    if (wanted && wanted.length > 0) {
      const cur = normalize(artifact.mainStat.name);
      mainOk = wanted.some(
        (w) =>
          normalize(w) === cur ||
          cur.includes(normalize(w)) ||
          normalize(w).includes(cur),
      );
    }
  } else if (artifact.slot <= 2) {
    mainOk = true; // flower/plume main stats are fixed — never wrong
  }

  return {
    slot: artifact.slot,
    slotName: artifact.slotName,
    cv: Math.round(cv * 10) / 10,
    rolls: Math.round(weightedRolls * 100) / 100,
    expected,
    efficiency,
    grade: letterArtifact(efficiency),
    mainOk,
    topSubs,
  };
}

export type ArtifactsGrade = {
  pieces: PieceGrade[];
  avgEfficiency: number;
  totalCV: number;
  grade: Letter;
  count: number;
};

export function gradeArtifacts(
  detail: CharacterDetail,
  guide: BuildGuide | null,
): ArtifactsGrade | null {
  if (!detail.artifacts.length) return null;
  const weights = substatWeights(guide);
  const pieces = [...detail.artifacts]
    .sort((a, b) => a.slot - b.slot)
    .map((a) => gradePiece(a, weights, guide));
  const avgEfficiency =
    pieces.reduce((s, p) => s + p.efficiency, 0) / pieces.length;
  const totalCV = Math.round(pieces.reduce((s, p) => s + p.cv, 0) * 10) / 10;
  return {
    pieces,
    avgEfficiency,
    totalCV,
    grade: letterArtifact(avgEfficiency),
    count: pieces.length,
  };
}

/**
 * Overall build grade from the guide checks: weight passes fully, warns half,
 * fails zero, and fold in artifact quality. Returns a letter + 0–100 score.
 */
export function gradeBuildOverall(
  checks: GuideCheck[] | null,
  artifacts: ArtifactsGrade | null,
): { grade: Letter; score: number; passed: number; total: number } | null {
  if (!checks || checks.length === 0) {
    if (!artifacts) return null;
    const score = Math.round(artifacts.avgEfficiency * 100);
    return { grade: artifacts.grade, score, passed: 0, total: 0 };
  }
  const weightFor = (s: GuideCheck["status"]) =>
    s === "pass" ? 1 : s === "warn" ? 0.5 : 0;
  const checkScore =
    checks.reduce((sum, c) => sum + weightFor(c.status), 0) / checks.length;
  // Blend: 70% guide checks, 30% artifact quality (when we have it).
  const blended = artifacts
    ? checkScore * 0.7 + artifacts.avgEfficiency * 0.3
    : checkScore;
  const passed = checks.filter((c) => c.status === "pass").length;
  return {
    grade: letterBuild(blended),
    score: Math.round(blended * 100),
    passed,
    total: checks.length,
  };
}

/* ------------------------------------------------------------------ */
/* Should the player farm artifacts, or are theirs good enough?         */
/* ------------------------------------------------------------------ */

export type ArtifactVerdict = {
  status: "ready" | "okay" | "farm";
  headline: string;
  reasons: string[];
};

const NON_STAT_LABELS = new Set([
  "Level",
  "Weapon",
  "Artifact set",
  "Sands",
  "Goblet",
  "Circlet",
  "Normal Attack",
  "Skill",
  "Burst",
]);

/**
 * Turn the grade + guide checks into an actionable call: are the equipped
 * artifacts good enough for this build, or is it worth farming better ones?
 */
export function artifactVerdict(
  artifacts: ArtifactsGrade | null,
  checks: GuideCheck[] | null,
): ArtifactVerdict | null {
  if (!artifacts) return null;
  const reasons: string[] = [];

  const offMain = artifacts.pieces
    .filter((p) => p.mainOk === false)
    .map((p) => p.slotName);
  if (offMain.length) reasons.push(`wrong main stat on ${offMain.join(", ")}`);

  const setCheck = checks?.find((c) => c.label === "Artifact set");
  const setBad = setCheck && setCheck.status !== "pass";
  if (setBad)
    reasons.push(
      setCheck.status === "fail" ? "not on the recommended set" : "set is only 2pc",
    );

  const statFails = (checks ?? []).filter(
    (c) => c.status === "fail" && !NON_STAT_LABELS.has(c.label),
  );
  if (statFails.length)
    reasons.push(`${statFails.map((c) => c.label).join(", ")} below target`);

  if (artifacts.avgEfficiency < 0.4) reasons.push("low substat roll quality");

  let status: ArtifactVerdict["status"];
  if (
    artifacts.avgEfficiency < 0.4 ||
    offMain.length > 0 ||
    (setCheck && setCheck.status === "fail") ||
    statFails.length >= 2
  ) {
    status = "farm";
  } else if (reasons.length === 0 && artifacts.avgEfficiency >= 0.5) {
    status = "ready";
  } else {
    status = "okay";
  }

  const headline =
    status === "ready"
      ? "Artifacts are good — no need to farm"
      : status === "farm"
        ? "Worth farming better artifacts"
        : "Artifacts are okay — farm to push further";
  return { status, headline, reasons };
}

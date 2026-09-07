/**
 * Per-character build plans (target levels, chosen weapon/set/main stats).
 * Stored in localStorage per account UID — device-local by design for now.
 */

export type BuildPlan = {
  // Desired targets.
  level: number;
  normal: number;
  skill: number;
  burst: number;
  weapon?: string;
  weaponLevel?: number;
  set?: string;
  setMode?: "4pc" | "2+2";
  sands?: string;
  goblet?: string;
  circlet?: string;
  // Optional "current" overrides for planning. When set, they replace the
  // live HoYoLab values (level/talents/constellation) as the starting point.
  curLevel?: number;
  curWeaponLevel?: number;
  curNormal?: number;
  curSkill?: number;
  curBurst?: number;
  curConstellation?: number;
};

function storageKey(uid: string) {
  return `orbital_plans_${uid}`;
}

export function loadPlans(uid: string): Record<string, BuildPlan> {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as Record<string, BuildPlan>) : {};
  } catch {
    return {};
  }
}

export function loadPlan(uid: string, characterId: number): BuildPlan | null {
  return loadPlans(uid)[String(characterId)] ?? null;
}

/** Replace the whole plans map (used when hydrating from server sync). */
export function replaceAllPlans(uid: string, plans: Record<string, BuildPlan>) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(plans));
  } catch {}
}

export function savePlan(uid: string, characterId: number, plan: BuildPlan) {
  try {
    const plans = loadPlans(uid);
    plans[String(characterId)] = plan;
    localStorage.setItem(storageKey(uid), JSON.stringify(plans));
  } catch {
    // Storage unavailable (private mode etc.) — plan lives for the session only.
  }
}

export function clearPlan(uid: string, characterId: number) {
  try {
    const plans = loadPlans(uid);
    delete plans[String(characterId)];
    localStorage.setItem(storageKey(uid), JSON.stringify(plans));
  } catch {}
}

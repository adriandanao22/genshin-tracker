/**
 * Build-priority characters: the ones the player chose to focus on (from the
 * My Roster page). Stored per account UID in localStorage, device-local.
 * These drive what the Overview's farming panel focuses on.
 */

function storageKey(uid: string) {
  return `orbital_priority_${uid}`;
}

export function loadPriority(uid: string): number[] {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

export function savePriority(uid: string, ids: number[]) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(ids));
  } catch {
    // Storage unavailable — priority lives for the session only.
  }
}

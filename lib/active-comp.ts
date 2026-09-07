/**
 * The team comp the player has chosen to build toward. Selected on the Teams
 * page; drives per-comp weapon/artifact/stat suggestions across the app. Stored
 * per account UID (localStorage, mirrored to Supabase like plans/priority).
 */

export type ActiveComp = {
  /** Archetype label, e.g. "Arlecchino Vaporize" — the key the modal matches. */
  label: string;
  anchorId: number;
  anchorName: string;
  lineupId: string;
  likes: number;
  members: Array<{ id: number; name: string; role: string | null }>;
  /**
   * Priority pins this comp added (ids that weren't already pinned). Removed
   * again when the comp is cleared or replaced, so clearing undoes its pins
   * without touching characters you pinned yourself.
   */
  pinnedIds?: number[];
};

function storageKey(uid: string) {
  return `orbital_activecomp_${uid}`;
}

export function loadActiveComp(uid: string): ActiveComp | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as ActiveComp) : null;
  } catch {
    return null;
  }
}

export function saveActiveComp(uid: string, comp: ActiveComp | null) {
  try {
    if (comp) localStorage.setItem(storageKey(uid), JSON.stringify(comp));
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // Storage unavailable — selection lives for the session only.
  }
}

/**
 * Player material inventory. HoYoLAB doesn't expose it, so it's imported from a
 * GOOD / Inventory-Kamera JSON (OCR scan of the in-game inventory). Stored per
 * account UID (localStorage, mirrored to Supabase like plans/priority).
 *
 * We keep the raw imported {materialKey: count} map and match it to our
 * genshin-db material names by NORMALIZED key (lowercase alphanumeric), which
 * lines up camelCase GOOD keys with our display names for the vast majority.
 */

export type Inventory = Record<string, number>;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Parse a GOOD / Inventory-Kamera export into a {materialKey: count} map. */
export function parseInventoryFile(
  text: string,
): { inventory: Inventory; count: number } | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  // GOOD files nest materials under `materials`; also accept a bare map.
  const mats =
    obj.materials && typeof obj.materials === "object"
      ? (obj.materials as Record<string, unknown>)
      : (obj as Record<string, unknown>);
  const inventory: Inventory = {};
  for (const [key, value] of Object.entries(mats)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      inventory[key] = value;
  }
  const count = Object.keys(inventory).length;
  return count > 0 ? { inventory, count } : null;
}

/** Normalized lookup (normalizedName → count) for matching against materials. */
export function ownedLookup(inventory: Inventory | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!inventory) return out;
  for (const [key, value] of Object.entries(inventory))
    if (value > 0) out[normalize(key)] = value;
  return out;
}

function storageKey(uid: string) {
  return `orbital_inventory_${uid}`;
}

export function loadInventory(uid: string): Inventory | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as Inventory) : null;
  } catch {
    return null;
  }
}

export function saveInventory(uid: string, inventory: Inventory | null) {
  try {
    if (inventory) localStorage.setItem(storageKey(uid), JSON.stringify(inventory));
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // Storage unavailable — inventory lives for the session only.
  }
}

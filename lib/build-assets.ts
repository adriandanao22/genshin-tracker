/**
 * Weapon + artifact-set assets (icon, rarity, secondary stat) for the build
 * planner pickers, extracted from genshin-db into /gamedata/build-assets.json.
 */

export type WeaponAsset = {
  name: string;
  rarity: number | null;
  type: string | null;
  stat: string | null;
  icon: string | null;
  /** Ascension costs keyed "1".."6" (one per ascension phase). */
  costs?: Record<string, Array<{ name: string; count: number }>>;
};

export type SetAsset = {
  name: string;
  rarity: number | null;
  icon: string | null;
};

export type BuildAssets = {
  weapons: Record<string, WeaponAsset>;
  sets: Record<string, SetAsset>;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function weaponIconUrl(filename: string | null | undefined) {
  return filename ? `https://gi.yatta.moe/assets/UI/${filename}.png` : null;
}

export function setIconUrl(filename: string | null | undefined) {
  return filename
    ? `https://gi.yatta.moe/assets/UI/reliquary/${filename}.png`
    : null;
}

let dataPromise: Promise<BuildAssets | null> | null = null;

export function loadBuildAssets(): Promise<BuildAssets | null> {
  dataPromise ??= fetch("/gamedata/build-assets.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return dataPromise;
}

export function findWeapon(
  assets: BuildAssets | null,
  name: string | null | undefined,
): WeaponAsset | null {
  if (!assets || !name) return null;
  return assets.weapons[normalize(name)] ?? null;
}

export function findSet(
  assets: BuildAssets | null,
  name: string | null | undefined,
): SetAsset | null {
  if (!assets || !name) return null;
  return assets.sets[normalize(name)] ?? null;
}

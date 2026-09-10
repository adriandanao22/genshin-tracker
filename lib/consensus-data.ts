/**
 * Bundled community-consensus builds, pre-generated from HoYoLAB's public
 * Lineup Simulator by scripts/extract-consensus.mjs. This is the first-class
 * guide source covering every character with lineup data — no third-party
 * scraping. The runtime still fetches live for freshness; this is the instant,
 * offline baseline that also drives the roster "Guide" badge.
 */
import consensusData from "@/public/gamedata/consensus.json";
import buildAssets from "@/public/gamedata/build-assets.json";
import type { ConsensusBuild } from "@/lib/hoyolab-lineup";

const byId = (
  consensusData as { consensus?: Record<string, ConsensusBuild> }
).consensus ?? {};

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// Some surfaces (the guides page) only know a character by name, so build a
// normalized-name → id map from the shared id↔name table.
const idByName = new Map<string, number>();
{
  const table = (buildAssets as { characterIdToName?: Record<string, { name?: string } | string> })
    .characterIdToName ?? {};
  for (const [id, value] of Object.entries(table)) {
    const name = typeof value === "string" ? value : value?.name;
    if (name) idByName.set(normalize(name), Number(id));
  }
}

/** Bundled consensus for a character, or null if none was captured. */
export function getBundledConsensus(characterId: number): ConsensusBuild | null {
  return byId[String(characterId)] ?? null;
}

/** Whether we have community build guidance for this character (by id). */
export function hasCommunityGuide(characterId: number): boolean {
  return Boolean(byId[String(characterId)]);
}

/** Bundled consensus resolved by character name (for id-less surfaces). */
export function getBundledConsensusByName(name: string): ConsensusBuild | null {
  const id = idByName.get(normalize(name));
  return id ? byId[String(id)] ?? null : null;
}

/** Whether we have community build guidance for this character (by name). */
export function hasCommunityGuideByName(name: string): boolean {
  return getBundledConsensusByName(name) !== null;
}

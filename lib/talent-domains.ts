/**
 * Talent-book domains. genshin-db reports the internal ley-line chamber name
 * (e.g. "Domain of Mastery: Realm of Slumber"), but each region has one
 * physical talent domain that all its book series share (Ballad, Resistance
 * and Freedom all drop at Forsaken Rift). We label cards by that physical
 * location — the names players and genshintrack.com use.
 *
 * Keyed by book series (the word after "Teachings of"), which maps 1:1 to a
 * region's domain and is stable game knowledge. Location names verified against
 * cdn.genshintrack.com/domains/<slug>.webp.
 */

export type TalentDomain = {
  location: string;
  region: string;
  slug: string;
};

const BY_SERIES: Record<string, TalentDomain> = {};

function register(location: string, region: string, slug: string, series: string[]) {
  for (const s of series) BY_SERIES[s.toLowerCase()] = { location, region, slug };
}

register("Forsaken Rift", "Mondstadt", "forsaken-rift", [
  "Freedom",
  "Resistance",
  "Ballad",
]);
register("Taishan Mansion", "Liyue", "taishan-mansion", [
  "Prosperity",
  "Diligence",
  "Gold",
]);
register("Violet Court", "Inazuma", "violet-court", [
  "Transience",
  "Elegance",
  "Light",
]);
register("Steeple of Ignorance", "Sumeru", "steeple-of-ignorance", [
  "Admonition",
  "Ingenuity",
  "Praxis",
]);
register("Pale Forgotten Glory", "Fontaine", "pale-forgotten-glory", [
  "Justice",
  "Order",
  "Equity",
]);
register("Blazing Ruins", "Natlan", "blazing-ruins", [
  "Contention",
  "Kindling",
  "Conflict",
]);
register("Lightless Capital", "Nod-Krai", "lightless-capital", [
  "Elysium",
  "Moonlight",
  "Vagrancy",
]);

/** Resolve a book name ("Teachings of Ballad") to its physical domain. */
export function domainForBook(bookName: string | null): TalentDomain | null {
  if (!bookName) return null;
  const series = bookName.replace(/^Teachings of\s+/i, "").trim().toLowerCase();
  return BY_SERIES[series] ?? null;
}

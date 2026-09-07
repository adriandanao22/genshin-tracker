import { NextResponse, type NextRequest } from "next/server";
import {
  aggregateLineups,
  fetchCharacterLineups,
  type ConsensusBuild,
} from "@/lib/hoyolab-lineup";

// Community consensus moves slowly; cache aggregations for 6 hours.
const cache = new Map<
  number,
  { expires: number; consensus: ConsensusBuild | null }
>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = Number.parseInt(id, 10);
  if (!Number.isFinite(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Invalid character id." }, { status: 400 });
  }

  const cached = cache.get(characterId);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ consensus: cached.consensus, cached: true });
  }

  try {
    const lineups = await fetchCharacterLineups(characterId);
    const consensus = aggregateLineups(characterId, lineups);
    cache.set(characterId, {
      expires: Date.now() + CACHE_TTL_MS,
      consensus,
    });
    return NextResponse.json({ consensus });
  } catch {
    return NextResponse.json(
      { error: "HoYoLAB lineups could not be reached. Try again later." },
      { status: 502 },
    );
  }
}

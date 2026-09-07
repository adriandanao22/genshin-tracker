import { NextResponse, type NextRequest } from "next/server";
import {
  fetchCharacterTeams,
  type LineupSuggestion,
} from "@/lib/hoyolab-lineup";

// Team comps move slowly; cache per character for 6 hours.
const cache = new Map<number, { expires: number; teams: LineupSuggestion[] }>();
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
    return NextResponse.json({ teams: cached.teams, cached: true });
  }

  try {
    const teams = await fetchCharacterTeams(characterId);
    cache.set(characterId, { expires: Date.now() + CACHE_TTL_MS, teams });
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json(
      { error: "HoYoLAB team data could not be reached. Try again later." },
      { status: 502 },
    );
  }
}

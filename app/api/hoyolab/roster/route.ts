import { NextResponse, type NextRequest } from "next/server";
import { fetchRoster, type RosterCharacter } from "@/lib/hoyolab-game-record";
import {
  getSessionFromRequest,
  recordErrorResponse,
} from "@/lib/hoyolab-route-helpers";

// The record API is rate-limited, so keep a short-lived per-account cache.
const cache = new Map<string, { expires: number; roster: RosterCharacter[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Connect your HoYoLAB account first." },
      { status: 401 },
    );
  }

  const cached = cache.get(session.uid);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ characters: cached.roster, cached: true });
  }

  try {
    const roster = await fetchRoster(session);
    cache.set(session.uid, { expires: Date.now() + CACHE_TTL_MS, roster });
    return NextResponse.json({ characters: roster });
  } catch (error) {
    return recordErrorResponse(error);
  }
}

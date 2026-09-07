import { NextResponse, type NextRequest } from "next/server";
import { fetchDailyNote, type DailyNote } from "@/lib/hoyolab-game-record";
import {
  getSessionFromRequest,
  recordErrorResponse,
} from "@/lib/hoyolab-route-helpers";

// Resin ticks every 8 min; a 1-minute cache keeps us well under rate limits
// while staying fresh enough (the client counts down between fetches).
const cache = new Map<string, { expires: number; note: DailyNote }>();
const CACHE_TTL_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Connect your HoYoLAB account first." },
      { status: 401 },
    );
  }

  // Enka (UID-only) sessions have no resin data.
  if (session.mode === "enka") return NextResponse.json({ note: null });

  if (request.nextUrl.searchParams.get("refresh") === "1")
    cache.delete(session.uid);
  const cached = cache.get(session.uid);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ note: cached.note, cached: true });
  }

  try {
    const note = await fetchDailyNote(session);
    cache.set(session.uid, { expires: Date.now() + CACHE_TTL_MS, note });
    return NextResponse.json({ note });
  } catch (error) {
    return recordErrorResponse(error);
  }
}

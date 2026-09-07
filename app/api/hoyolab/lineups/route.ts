import { NextResponse, type NextRequest } from "next/server";
import { serverByRegion } from "@/lib/hoyolab-auth";
import {
  fetchLineupSuggestions,
  type LineupSuggestion,
} from "@/lib/hoyolab-lineup";
import { getSessionFromRequest } from "@/lib/hoyolab-route-helpers";

const regionByServer: Record<string, string> = Object.fromEntries(
  Object.entries(serverByRegion).map(([region, server]) => [server, region]),
);

const cache = new Map<
  string,
  { expires: number; source: string; lineups: LineupSuggestion[] }
>();
const CACHE_TTL_MS = 60 * 60 * 1000;

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
    return NextResponse.json({
      source: cached.source,
      lineups: cached.lineups,
      cached: true,
    });
  }

  try {
    const { source, lineups } = await fetchLineupSuggestions({
      uid: session.uid,
      region: regionByServer[session.server],
      cookie: `ltuid_v2=${session.ltuid}; ltoken_v2=${session.ltoken}`,
    });
    cache.set(session.uid, {
      expires: Date.now() + CACHE_TTL_MS,
      source,
      lineups,
    });
    return NextResponse.json({ source, lineups });
  } catch {
    return NextResponse.json(
      { error: "HoYoLAB lineups could not be reached. Try again later." },
      { status: 502 },
    );
  }
}

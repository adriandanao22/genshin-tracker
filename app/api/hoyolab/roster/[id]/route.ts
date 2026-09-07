import { NextResponse, type NextRequest } from "next/server";
import {
  fetchCharacterDetails,
  type CharacterDetail,
} from "@/lib/hoyolab-game-record";
import { getEnkaProfile, EnkaError } from "@/lib/enka";
import {
  getSessionFromRequest,
  recordErrorResponse,
} from "@/lib/hoyolab-route-helpers";

const cache = new Map<string, { expires: number; detail: CharacterDetail }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Connect your HoYoLAB account first." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const characterId = Number.parseInt(id, 10);
  if (!Number.isFinite(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Invalid character id." }, { status: 400 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (session.mode === "enka") {
    try {
      const profile = await getEnkaProfile(session.uid, refresh);
      const detail = profile.details[characterId];
      if (!detail) {
        return NextResponse.json(
          { error: "This character isn't in your in-game Showcase." },
          { status: 404 },
        );
      }
      return NextResponse.json({ character: detail, source: "enka" });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof EnkaError ? error.message : "Enka fetch failed" },
        { status: 502 },
      );
    }
  }

  const cacheKey = `${session.uid}:${characterId}`;
  if (refresh) cache.delete(cacheKey);
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ character: cached.detail, cached: true });
  }

  try {
    const details = await fetchCharacterDetails(session, [characterId]);
    const detail = details[0];
    if (!detail) {
      return NextResponse.json(
        { error: "This character was not found on your account." },
        { status: 404 },
      );
    }
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, detail });
    return NextResponse.json({ character: detail });
  } catch (error) {
    return recordErrorResponse(error);
  }
}

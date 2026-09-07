import { NextResponse } from "next/server";
import { getEnkaProfile, EnkaError } from "@/lib/enka";
import {
  encryptSession,
  sessionCookieName,
  type HoyoLabSession,
} from "@/lib/hoyolab-session";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** No-login connection: verify a UID via Enka.network and start an Enka session. */
export async function POST(request: Request) {
  if (!process.env.HOYOLAB_SESSION_SECRET) {
    return jsonError("The server is missing HOYOLAB_SESSION_SECRET.", 503);
  }

  let body: { uid?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter your UID to continue.");
  }

  const uid = body.uid?.trim();
  if (!uid || !/^\d{9,10}$/.test(uid))
    return jsonError("Enter a valid 9-digit UID.");

  let profile: Awaited<ReturnType<typeof getEnkaProfile>>;
  try {
    profile = await getEnkaProfile(uid);
  } catch (error) {
    return jsonError(
      error instanceof EnkaError ? error.message : "Couldn't reach Enka.network.",
      502,
    );
  }
  if (profile.roster.length === 0) {
    return jsonError(
      "No characters found. In-game, open your profile → enable 'Show Character Details' and add characters to your Showcase, then try again.",
      422,
    );
  }

  const session = {
    uid: profile.player.uid,
    server: profile.player.server,
    ltuid: "",
    ltoken: "",
    mode: "enka",
  } satisfies HoyoLabSession;

  const response = NextResponse.json({
    player: {
      name: profile.player.name,
      uid: profile.player.uid,
      server: profile.player.server,
      level: profile.player.level,
      updated: "just now",
    },
  });
  response.cookies.set(sessionCookieName, encryptSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

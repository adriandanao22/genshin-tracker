import { NextResponse } from "next/server";
import { fetchGenshinRole } from "@/lib/hoyolab-auth";
import {
  encryptSession,
  sessionCookieName,
  type HoyoLabSession,
} from "@/lib/hoyolab-session";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Fallback connection path: paste ltuid_v2 / ltoken_v2 cookies manually. */
export async function POST(request: Request) {
  if (!process.env.HOYOLAB_SESSION_SECRET) {
    return jsonError(
      "The server is missing HOYOLAB_SESSION_SECRET. Add it to .env.local before connecting.",
      503,
    );
  }

  let body: { ltuid?: string; ltoken?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter your connection details to continue.");
  }

  const ltuid = body.ltuid?.trim();
  const ltoken = body.ltoken?.trim();
  if (!ltuid || !ltoken) return jsonError("Both HoYoLAB cookies are required.");

  let roles: Awaited<ReturnType<typeof fetchGenshinRole>>;
  try {
    roles = await fetchGenshinRole(ltuid, ltoken);
  } catch {
    return jsonError(
      "HoYoLAB could not be reached. Try again in a moment.",
      502,
    );
  }
  if (roles.status === "error") {
    return jsonError(
      roles.retcode === 0
        ? roles.message
        : "HoYoLAB rejected these cookies. Copy fresh ltuid_v2 and ltoken_v2 values and try again.",
      roles.retcode === 0 ? 422 : 401,
    );
  }

  const session = {
    uid: roles.role.uid,
    server: roles.role.server,
    ltuid,
    ltoken,
  } satisfies HoyoLabSession;

  const response = NextResponse.json({
    player: {
      name: roles.role.nickname,
      uid: roles.role.uid,
      server: roles.role.server,
      level: roles.role.level,
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

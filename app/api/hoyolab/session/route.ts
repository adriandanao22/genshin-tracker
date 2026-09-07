import { NextResponse, type NextRequest } from "next/server";
import { fetchGenshinRole } from "@/lib/hoyolab-auth";
import { decryptSession, sessionCookieName } from "@/lib/hoyolab-session";
import { getEnkaProfile } from "@/lib/enka";

function clearSession(body: Record<string, unknown>) {
  const response = NextResponse.json(body);
  response.cookies.delete(sessionCookieName);
  return response;
}

/** Restore the connected player from the encrypted session cookie. */
export async function GET(request: NextRequest) {
  if (!process.env.HOYOLAB_SESSION_SECRET)
    return NextResponse.json({ player: null });

  const cookie = request.cookies.get(sessionCookieName)?.value;
  const session = cookie ? decryptSession(cookie) : null;
  if (!session) return NextResponse.json({ player: null });

  if (session.mode === "enka") {
    try {
      const profile = await getEnkaProfile(session.uid);
      return NextResponse.json({
        player: {
          name: profile.player.name,
          uid: profile.player.uid,
          server: profile.player.server,
          level: profile.player.level,
          updated: "just now",
        },
      });
    } catch {
      return NextResponse.json({
        player: {
          name: null,
          uid: session.uid,
          server: session.server,
          level: null,
          updated: "earlier",
        },
      });
    }
  }

  try {
    const roles = await fetchGenshinRole(session.ltuid, session.ltoken);
    if (roles.status === "error") {
      // Cookies expired or were revoked on HoYoLAB's side.
      return clearSession({ player: null });
    }
    return NextResponse.json({
      player: {
        name: roles.role.nickname,
        uid: roles.role.uid,
        server: roles.role.server,
        level: roles.role.level,
        updated: "just now",
      },
    });
  } catch {
    // HoYoLAB unreachable: fall back to the stored identity.
    return NextResponse.json({
      player: {
        name: null,
        uid: session.uid,
        server: session.server,
        level: null,
        updated: "earlier",
      },
    });
  }
}

/** Disconnect: drop the session cookie. */
export async function DELETE() {
  return clearSession({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { GameRecordError } from "@/lib/hoyolab-game-record";
import { decryptSession, sessionCookieName } from "@/lib/hoyolab-session";

export function getSessionFromRequest(request: NextRequest) {
  const cookie = request.cookies.get(sessionCookieName)?.value;
  return cookie ? decryptSession(cookie) : null;
}

/** Map game-record failures to user-facing responses. */
export function recordErrorResponse(error: unknown) {
  if (error instanceof GameRecordError) {
    if (error.retcode === 10001 || error.retcode === -100) {
      const response = NextResponse.json(
        { error: "Your HoYoLAB session expired. Sign in again." },
        { status: 401 },
      );
      response.cookies.delete(sessionCookieName);
      return response;
    }
    if (error.retcode === 10102) {
      return NextResponse.json(
        {
          error:
            "Your Battle Chronicle is private. Enable 'Show my Battle Chronicle' in HoYoLAB privacy settings.",
        },
        { status: 403 },
      );
    }
    if (error.retcode === 1034 || error.retcode === 5003) {
      return NextResponse.json(
        {
          error:
            "HoYoLAB flagged this request for verification. Open your Battle Chronicle on hoyolab.com once, then retry.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: `HoYoLAB error: ${error.message}` },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { error: "HoYoLAB could not be reached. Try again in a moment." },
    { status: 502 },
  );
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  fetchGenshinRole,
  webLoginByPassword,
  type GeetestResult,
} from "@/lib/hoyolab-auth";
import {
  encryptSession,
  sessionCookieName,
  type HoyoLabSession,
} from "@/lib/hoyolab-session";

const friendlyErrors: Record<number, string> = {
  [-3208]: "Incorrect email or password.",
  [-3206]: "Incorrect email or password.",
  [-3203]: "This account was locked after too many attempts. Try again later.",
  [-3235]: "Too many login attempts. Wait a moment and try again.",
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!process.env.HOYOLAB_SESSION_SECRET) {
    return jsonError(
      "The server is missing HOYOLAB_SESSION_SECRET. Add it to .env.local before connecting.",
      503,
    );
  }

  let body: {
    email?: string;
    password?: string;
    deviceId?: string;
    mmtResult?: GeetestResult;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Enter your HoYoLAB email and password to continue.");
  }

  const email = body.email?.trim();
  const password = body.password;
  if (!email || !email.includes("@"))
    return jsonError("Enter the email address of your HoYoLAB account.");
  if (!password) return jsonError("Enter your HoYoLAB password.");

  const deviceId = body.deviceId?.trim() || randomUUID();

  let login: Awaited<ReturnType<typeof webLoginByPassword>>;
  try {
    login = await webLoginByPassword(email, password, deviceId, body.mmtResult);
  } catch {
    return jsonError(
      "HoYoLAB could not be reached. Try again in a moment.",
      502,
    );
  }

  if (login.status === "captcha") {
    // 428 tells the client to solve the geetest challenge and retry.
    return NextResponse.json({ captcha: login.captcha }, { status: 428 });
  }
  if (login.status === "error") {
    return jsonError(
      friendlyErrors[login.retcode] ??
        `HoYoLAB rejected the login (${login.message}).`,
      401,
    );
  }

  let roles: Awaited<ReturnType<typeof fetchGenshinRole>>;
  try {
    roles = await fetchGenshinRole(login.ltuid, login.ltoken);
  } catch {
    return jsonError(
      "Signed in, but your game accounts could not be loaded. Try again in a moment.",
      502,
    );
  }
  if (roles.status === "error") return jsonError(roles.message, 422);

  const session = {
    uid: roles.role.uid,
    server: roles.role.server,
    ltuid: login.ltuid,
    ltoken: login.ltoken,
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

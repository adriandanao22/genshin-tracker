import { NextResponse, type NextRequest } from "next/server";
import { decryptSession, sessionCookieName } from "@/lib/hoyolab-session";
import { getUserData, saveUserData, syncEnabled } from "@/lib/user-store";
import type { BuildPlan } from "@/lib/plans";
import type { ActiveComp } from "@/lib/active-comp";
import type { Inventory } from "@/lib/inventory";

/**
 * Durable sync for build plans + priority. The UID is taken ONLY from the
 * decrypted session cookie — never from the request body — so a caller can't
 * read or write another player's data by supplying a UID. Rows are stored
 * under a pseudonym (see lib/uid-hash); no credentials are persisted.
 */
function sessionUid(request: NextRequest): string | null {
  const cookie = request.cookies.get(sessionCookieName)?.value;
  return cookie ? (decryptSession(cookie)?.uid ?? null) : null;
}

export async function GET(request: NextRequest) {
  if (!syncEnabled()) return NextResponse.json({ enabled: false });
  const uid = sessionUid(request);
  if (!uid) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  try {
    const data = await getUserData(uid);
    return NextResponse.json({ enabled: true, ...data });
  } catch {
    return NextResponse.json({ error: "Sync read failed" }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  if (!syncEnabled()) return NextResponse.json({ enabled: false });
  const uid = sessionUid(request);
  if (!uid) return NextResponse.json({ error: "Not connected" }, { status: 401 });

  let body: {
    priority?: number[];
    plans?: Record<string, BuildPlan>;
    activeComp?: ActiveComp | null;
    inventory?: Inventory | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const partial: {
    priority?: number[];
    plans?: Record<string, BuildPlan>;
    activeComp?: ActiveComp | null;
    inventory?: Inventory | null;
  } = {};
  if (Array.isArray(body.priority))
    partial.priority = body.priority.filter((id) => typeof id === "number");
  if (body.plans && typeof body.plans === "object") partial.plans = body.plans;
  if ("activeComp" in body) partial.activeComp = body.activeComp ?? null;
  if ("inventory" in body) partial.inventory = body.inventory ?? null;

  try {
    await saveUserData(uid, partial);
    return NextResponse.json({ enabled: true, ok: true });
  } catch {
    return NextResponse.json({ error: "Sync write failed" }, { status: 502 });
  }
}

/**
 * Client-side sync between localStorage (the immediate, offline source of
 * truth) and the durable server store (/api/userdata, backed by Supabase).
 *
 * localStorage always stays authoritative for the current session so the UI
 * never blocks on the network; the server is hydrated on connect and updated
 * fire-and-forget on every change. When sync is disabled (Supabase not
 * configured) every call is a graceful no-op and the app is localStorage-only.
 */
import { loadPlans, replaceAllPlans, type BuildPlan } from "@/lib/plans";
import { loadPriority, savePriority } from "@/lib/priority";
import {
  loadActiveComp,
  saveActiveComp,
  type ActiveComp,
} from "@/lib/active-comp";

type Payload = {
  priority?: number[];
  plans?: Record<string, BuildPlan>;
  activeComp?: ActiveComp | null;
};

/** Fire-and-forget push; the UID is derived server-side from the cookie. */
export function pushUserData(partial: Payload): void {
  try {
    void fetch("/api/userdata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    }).catch(() => {});
  } catch {
    // Network unavailable — localStorage already holds the change.
  }
}

export function syncPriority(ids: number[]): void {
  pushUserData({ priority: ids });
}

export function syncPlans(uid: string): void {
  pushUserData({ plans: loadPlans(uid) });
}

export function syncActiveComp(comp: ActiveComp | null): void {
  pushUserData({ activeComp: comp });
}

/**
 * On connect: pull the server copy into localStorage. If the server has data
 * it wins (cross-device); if it's empty, push any existing local data up so a
 * first-time user's device migrates its plans into the cloud.
 */
export async function hydrateUserData(uid: string): Promise<void> {
  let server: (Payload & { enabled?: boolean }) | null = null;
  try {
    const res = await fetch("/api/userdata", { cache: "no-store" });
    if (res.ok) server = await res.json();
  } catch {
    return;
  }
  if (!server || !server.enabled) return; // sync off → keep localStorage as-is

  const serverPriority = server.priority ?? [];
  const serverPlans = server.plans ?? {};
  const serverActiveComp = server.activeComp ?? null;
  const serverHasData =
    serverPriority.length > 0 ||
    Object.keys(serverPlans).length > 0 ||
    serverActiveComp !== null;

  if (serverHasData) {
    savePriority(uid, serverPriority);
    replaceAllPlans(uid, serverPlans);
    saveActiveComp(uid, serverActiveComp);
  } else {
    const localPriority = loadPriority(uid);
    const localPlans = loadPlans(uid);
    const localActiveComp = loadActiveComp(uid);
    if (
      localPriority.length > 0 ||
      Object.keys(localPlans).length > 0 ||
      localActiveComp
    )
      pushUserData({
        priority: localPriority,
        plans: localPlans,
        activeComp: localActiveComp,
      });
  }
}

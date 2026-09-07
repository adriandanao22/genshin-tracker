import "server-only";
import { getSupabase } from "@/lib/supabase-server";
import { uidHash } from "@/lib/uid-hash";
import type { BuildPlan } from "@/lib/plans";
import type { ActiveComp } from "@/lib/active-comp";
import type { Inventory } from "@/lib/inventory";

/**
 * Durable, non-sensitive user data: build plans + priority character ids.
 * Rows are keyed by the UID pseudonym (see lib/uid-hash) — the real UID and
 * anything credential-bearing never reach the database.
 */

const TABLE = "user_data";

export type UserData = {
  priority: number[];
  plans: Record<string, BuildPlan>;
  activeComp: ActiveComp | null;
  inventory: Inventory | null;
};

const EMPTY: UserData = {
  priority: [],
  plans: {},
  activeComp: null,
  inventory: null,
};

/** Whether server-side sync is available (Supabase configured). */
export function syncEnabled(): boolean {
  return getSupabase() !== null;
}

export async function getUserData(uid: string): Promise<UserData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    // select("*") so a not-yet-migrated active_comp column can't break the read.
    .select("*")
    .eq("uid_hash", uidHash(uid))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...EMPTY };
  return {
    priority: Array.isArray(data.priority) ? data.priority : [],
    plans: (data.plans as Record<string, BuildPlan>) ?? {},
    activeComp: (data.active_comp as ActiveComp | null) ?? null,
    inventory: (data.inventory as Inventory | null) ?? null,
  };
}

/** Upsert the provided fields; omitted fields are left untouched. */
export async function saveUserData(
  uid: string,
  partial: Partial<UserData>,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const row: Record<string, unknown> = {
    uid_hash: uidHash(uid),
    updated_at: new Date().toISOString(),
  };
  if (partial.priority !== undefined) row.priority = partial.priority;
  if (partial.plans !== undefined) row.plans = partial.plans;
  if (partial.activeComp !== undefined) row.active_comp = partial.activeComp;
  if (partial.inventory !== undefined) row.inventory = partial.inventory;
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "uid_hash" });
  if (error) throw new Error(error.message);
  return true;
}

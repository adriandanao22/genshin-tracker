import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service_role key.
 *
 * Our authorization is the encrypted HoYoLAB session cookie, not Supabase
 * Auth, so the browser never talks to Supabase directly — only our API routes
 * do, with the service_role key that must stay secret (never NEXT_PUBLIC_*).
 * Row Level Security is enabled with no public policies as defence in depth.
 *
 * Returns null when the env isn't configured so the app degrades to
 * localStorage-only instead of crashing.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

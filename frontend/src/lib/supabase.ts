import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser Supabase client — used for authentication only.
 *
 * Deliberately never used to read or write CRM tables. Every booking, payment
 * and commission goes through the NestJS API, because those operations need a
 * server-side transaction (unit locking, price freezing, schedule generation)
 * that a client-side table write cannot provide. Row Level Security would stop
 * a malicious write, but it cannot make a fourteen-step booking atomic.
 *
 * The publishable/anon key is designed to be public and is protected by RLS,
 * not by secrecy. The service-role key never reaches this file.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client !== null) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Absent in mock mode, which must keep working with no Supabase project at all.
  if (url === undefined || key === undefined || url === '' || key === '') return null;

  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/**
 * The current access token, or null.
 *
 * Read fresh on each API call rather than cached: `autoRefreshToken` rotates it
 * in the background, and a stale copy produces sporadic 401s that are painful
 * to reproduce.
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (supabase === null) return null;

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabase();
  if (supabase === null) throw new Error('Supabase is not configured.');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const _supabaseClient: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '');
}

// Export supabase with non-null assertion for easier usage
// Functions that use supabase should handle the case where it's not configured
export const supabase = _supabaseClient as SupabaseClient;

export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured() || !_supabaseClient) {
    return false;
  }

  try {
    // Simple health check - try to get the current session
    const { error } = await _supabaseClient.auth.getSession();
    return !error;
  } catch {
    return false;
  }
}

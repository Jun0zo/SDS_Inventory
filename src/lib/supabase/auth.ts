import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './client';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if Supabase is properly configured
    if (!isSupabaseConfigured() || !supabase) {
      setError(new Error('Supabase is not configured. Please check your environment variables.'));
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to get session:', err);
        setError(err as Error);
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      setError(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, user, loading, error };
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // Ensure user exists in public.users
  if (data.user) {
    await ensureUserProfile(data.user);
  }

  return data;
}

export async function signUp(email: string, password: string, displayName?: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });

  if (error) throw error;

  // Create user profile
  if (data.user) {
    await ensureUserProfile(data.user, displayName);
  }

  return data;
}

export async function signOut() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPasswordEmail(email: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
}

/**
 * Ensure user profile exists in public.users table
 */
async function ensureUserProfile(user: User, displayName?: string) {
  if (!supabase) {
    console.error('Supabase is not configured');
    return;
  }

  const { error } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      email: user.email!,
      display_name: displayName || user.user_metadata?.display_name || user.email?.split('@')[0],
    })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to create user profile:', error);
  }
}

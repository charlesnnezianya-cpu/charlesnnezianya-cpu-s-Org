import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  fetchUserProfile,
  isSupabaseConfigured,
  requireSupabase,
  supabase,
  upsertUserProfile,
} from '../lib/supabase';
import type { UserProfile } from '../types/brainstine';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{ needsEmailVerification: boolean }>;
  signInWithEmail: (params: { email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);

  const loadOrCreateProfile = async (authUser: User) => {
    try {
      const existing = await fetchUserProfile(authUser.id);
      if (existing) {
        setProfile(existing);
        return;
      }
      const fallbackName =
        (authUser.user_metadata?.display_name as string | undefined) ||
        (authUser.user_metadata?.full_name as string | undefined) ||
        authUser.email?.split('@')[0] ||
        'Student';

      const created = await upsertUserProfile({
        id: authUser.id,
        email: authUser.email || '',
        display_name: fallbackName,
      });
      setProfile(created);
    } catch (err) {
      console.warn('Profile sync warning:', err);
      const fallbackName =
        (authUser.user_metadata?.display_name as string | undefined) ||
        (authUser.user_metadata?.full_name as string | undefined) ||
        authUser.email?.split('@')[0] ||
        'Student';
      setProfile({
        id: authUser.id,
        email: authUser.email || '',
        display_name: fallbackName,
      });
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadOrCreateProfile(data.session.user).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        loadOrCreateProfile(nextSession.user);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUpWithEmail = async ({
    email,
    password,
    displayName,
  }: {
    email: string;
    password: string;
    displayName: string;
  }) => {
    const client = requireSupabase();
    const redirectTo = window.location.origin;
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    // Supabase returns a user with empty identities if already registered in some configs
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    if (data.session?.user) {
      await loadOrCreateProfile(data.session.user);
      return { needsEmailVerification: false };
    }

    return { needsEmailVerification: true };
  };

  const signInWithEmail = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data.user) {
      await loadOrCreateProfile(data.user);
    }
  };

  const signInWithGoogle = async () => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  };

  const requestPasswordReset = async (email: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      throw new Error(error.message);
    }
  };

  const updatePassword = async (newPassword: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
    setIsPasswordRecovery(false);
  };

  const updateDisplayName = async (displayName: string) => {
    const client = requireSupabase();
    if (!user) throw new Error('You must be signed in to update your profile.');
    const trimmed = displayName.trim();
    if (!trimmed) throw new Error('Display name cannot be empty.');

    const { error: authErr } = await client.auth.updateUser({
      data: { display_name: trimmed },
    });
    if (authErr) throw new Error(authErr.message);

    const updated = await upsertUserProfile({
      id: user.id,
      email: user.email || '',
      display_name: trimmed,
    });
    setProfile(updated);
  };

  const signOut = async () => {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadOrCreateProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isConfigured: isSupabaseConfigured,
        isPasswordRecovery,
        clearPasswordRecovery: () => setIsPasswordRecovery(false),
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        requestPasswordReset,
        updatePassword,
        updateDisplayName,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  fetchUserProfile,
  isSupabaseConfigured,
  requireSupabase,
  supabase,
  upsertUserProfile,
} from '../lib/supabase';
import { sanitizeUserErrorMessage } from '../lib/apiClient';
import type { UserProfile } from '../types/brainstine';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  oauthError: string | null;
  pendingOauthUrl: string | null;
  clearPasswordRecovery: () => void;
  clearOauthError: () => void;
  clearPendingOauthUrl: () => void;
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

function formatFriendlyAuthError(rawMessage: string, fallback: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Incorrect email or password. Please check your details and try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address from your inbox before signing in.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (lower.includes('password') && lower.includes('at least')) {
    return rawMessage;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }
  const safe = sanitizeUserErrorMessage(rawMessage, 'sign in');
  return safe === 'Something went wrong. Please try again.' ? fallback : safe;
}

function formatReadableOAuthError(
  errorCode: string,
  errorSubCode: string,
  errorDescription: string
): string {
  const combined = `${errorCode} ${errorSubCode} ${errorDescription}`.toLowerCase();

  if (
    combined.includes('redirect_uri_mismatch') ||
    combined.includes('deleted_client') ||
    combined.includes('invalid_client') ||
    combined.includes('org_internal')
  ) {
    return 'Google Sign-In is temporarily unavailable. Please sign in with your email and password or try again shortly.';
  }
  if (combined.includes('access_denied') || combined.includes('403')) {
    return 'Google Sign-In was cancelled or could not be completed. Please try again or use your email and password.';
  }
  if (
    combined.includes('unable to exchange external code') ||
    combined.includes('server_error') ||
    combined.includes('bad_oauth_state') ||
    combined.includes('invalid_request')
  ) {
    return 'Your Google Sign-In session could not be verified. Please try again or use your email and password.';
  }
  const cleanDesc = errorDescription.replace(/\+/g, ' ').trim();
  if (cleanDesc) {
    return sanitizeUserErrorMessage(cleanDesc, 'sign in');
  }
  return 'Google Sign-In could not be completed. Please try again or use your email and password.';
}

function consumeUrlOAuthError(): string | null {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashRaw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hashRaw);

    const err = searchParams.get('error') || hashParams.get('error') || '';
    const errCode = searchParams.get('error_code') || hashParams.get('error_code') || '';
    const errDesc =
      searchParams.get('error_description') || hashParams.get('error_description') || '';

    if (!err && !errCode && !errDesc) {
      return null;
    }

    const message = formatReadableOAuthError(err, errCode, errDesc);

    for (const key of ['error', 'error_code', 'error_description']) {
      searchParams.delete(key);
      hashParams.delete(key);
    }
    const nextSearch = searchParams.toString();
    const nextHash = hashParams.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`;
    window.history.replaceState(null, '', cleanUrl);

    return message;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [oauthError, setOauthError] = useState<string | null>(() => consumeUrlOAuthError());
  const [pendingOauthUrl, setPendingOauthUrl] = useState<string | null>(null);

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
        (authUser.user_metadata?.name as string | undefined) ||
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
        (authUser.user_metadata?.name as string | undefined) ||
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
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 6000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          setPendingOauthUrl(null);
          setOauthError(null);
          loadOrCreateProfile(data.session.user).finally(() => {
            if (mounted) {
              clearTimeout(safetyTimer);
              setLoading(false);
            }
          });
        } else {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          clearTimeout(safetyTimer);
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
        setPendingOauthUrl(null);
        setOauthError(null);
        loadOrCreateProfile(nextSession.user);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
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
      throw new Error(
        formatFriendlyAuthError(error.message, 'We could not create your account right now. Please try again.')
      );
    }

    // Account with empty identities indicates existing registration
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
      throw new Error(
        formatFriendlyAuthError(error.message, 'We could not sign you in right now. Please try again.')
      );
    }
    if (data.user) {
      await loadOrCreateProfile(data.user);
    }
  };

  const signInWithGoogle = async () => {
    const client = requireSupabase();
    setOauthError(null);
    setPendingOauthUrl(null);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const statusRes = await fetch(
        `/api/auth/oauth-status?redirectTo=${encodeURIComponent(window.location.origin)}`,
        { signal: controller.signal }
      ).finally(() => clearTimeout(timer));

      if (statusRes.ok) {
        const status = (await statusRes.json()) as {
          supabaseConfigured?: boolean;
          googleEnabled?: boolean;
          hasClientId?: boolean;
          googleErrorType?: string | null;
        };

        if (status.supabaseConfigured && (!status.googleEnabled || !status.hasClientId)) {
          throw new Error(
            'Google Sign-In is temporarily unavailable. Please sign in with your email and password.'
          );
        }
        if (status.googleErrorType) {
          throw new Error(formatReadableOAuthError(status.googleErrorType, '', ''));
        }
      }
    } catch (preflightErr: unknown) {
      if (
        preflightErr instanceof Error &&
        preflightErr.name !== 'AbortError' &&
        preflightErr.message.includes('Google Sign-In')
      ) {
        throw preflightErr;
      }
    }

    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    const redirectTo = window.location.origin;

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: inIframe,
      },
    });
    if (error) {
      throw new Error(
        formatFriendlyAuthError(
          error.message,
          'Google Sign-In could not be started right now. Please try again or use your email and password.'
        )
      );
    }

    if (data?.url && data.url.includes('google.com/url')) {
      throw new Error(
        'Google Sign-In is temporarily unavailable. Please sign in with your email and password.'
      );
    }

    if (inIframe) {
      if (data?.url) {
        setPendingOauthUrl(data.url);
      } else {
        throw new Error(
          'Google Sign-In could not open inside this embedded window. Please open Brainstine in a full browser tab or sign in with your email and password.'
        );
      }
    }
  };

  const requestPasswordReset = async (email: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      throw new Error(
        formatFriendlyAuthError(error.message, 'We could not send the password reset email. Please try again.')
      );
    }
  };

  const updatePassword = async (newPassword: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(
        formatFriendlyAuthError(error.message, 'We could not update your password right now. Please try again.')
      );
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
    if (authErr) {
      throw new Error(
        formatFriendlyAuthError(authErr.message, 'We could not update your profile right now. Please try again.')
      );
    }

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
      throw new Error(
        formatFriendlyAuthError(error.message, 'We could not sign you out right now. Please try again.')
      );
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
        oauthError,
        pendingOauthUrl,
        clearPasswordRecovery: () => setIsPasswordRecovery(false),
        clearOauthError: () => setOauthError(null),
        clearPendingOauthUrl: () => setPendingOauthUrl(null),
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

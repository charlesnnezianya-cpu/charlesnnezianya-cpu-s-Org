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

function formatReadableOAuthError(
  errorCode: string,
  errorSubCode: string,
  errorDescription: string
): string {
  const combined = `${errorCode} ${errorSubCode} ${errorDescription}`.toLowerCase();

  if (combined.includes('redirect_uri_mismatch')) {
    return 'Google Sign-In could not start because the Authorized Redirect URI in Google Cloud Console does not match Supabase’s OAuth callback URL. Please use Email & Password meanwhile, or register the Supabase callback URL in Google Cloud.';
  }
  if (combined.includes('org_internal')) {
    return 'Google Sign-In is restricted to an internal organization (403). Please ask the administrator to set the Google OAuth consent screen to External, or sign in with Email & Password.';
  }
  if (combined.includes('access_denied') || combined.includes('403')) {
    return 'Google Sign-In access was denied (403). This happens if sign-in was cancelled, or if the Google OAuth app is in Testing mode and your Google account has not been added as an authorized test user. You can try again or use Email & Password.';
  }
  if (combined.includes('deleted_client') || combined.includes('invalid_client')) {
    return 'Google Sign-In failed because the Google OAuth Client ID or Secret in Supabase is invalid or missing. Please sign in with Email & Password meanwhile.';
  }
  if (combined.includes('unable to exchange external code') || combined.includes('server_error')) {
    return 'Google Sign-In could not complete verification with Supabase. Please verify the Google Client Secret in Supabase or sign in with Email & Password.';
  }
  if (combined.includes('bad_oauth_state') || combined.includes('invalid_request')) {
    return 'Google Sign-In session expired or could not be verified. Please click Continue with Google again or sign in with Email & Password.';
  }
  const cleanDesc = errorDescription.replace(/\+/g, ' ').trim();
  return cleanDesc || 'Google Sign-In could not be completed. Please try again or use Email & Password.';
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
    setOauthError(null);
    setPendingOauthUrl(null);

    const hasBackendPreflight =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.run.app');

    if (hasBackendPreflight) {
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

          if (status.supabaseConfigured && !status.googleEnabled) {
            throw new Error(
              'Google Sign-In is not currently enabled in Supabase Authentication. Please sign in with your email and password.'
            );
          }
          if (status.googleEnabled && !status.hasClientId) {
            throw new Error(
              'Google Sign-In is enabled in Supabase, but the Google OAuth Client ID is missing. Please sign in with your email and password meanwhile.'
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
          (preflightErr.message.includes('Google Sign-In') ||
            preflightErr.message.includes('OAuth'))
        ) {
          throw preflightErr;
        }
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
      throw new Error(error.message);
    }

    if (data?.url && data.url.includes('google.com/url')) {
      throw new Error(
        'OAuth redirect URL is wrapped in a Google Redirect Notice link. Please update Supabase Authentication URL Configuration to use clean Brainstine URLs.'
      );
    }

    if (inIframe) {
      if (data?.url) {
        setPendingOauthUrl(data.url);
      } else {
        throw new Error(
          'Unable to start Google Sign-In inside the embedded preview. Please open Brainstine in a full browser tab or use Email & Password.'
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

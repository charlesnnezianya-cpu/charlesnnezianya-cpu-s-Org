import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthModal, type AuthModalMode } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { DashboardLayout } from './components/DashboardLayout';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { WelcomePage } from './components/WelcomePage';

function normalizePath(rawPath: string): string {
  const cleaned = rawPath.replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

function hasStoredAuthSession(): boolean {
  try {
    return Object.keys(localStorage).some(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );
  } catch {
    return false;
  }
}

function BrainstineRoot() {
  const { user, profile, loading, isPasswordRecovery, oauthError } = useAuth();
  const { setTheme } = useTheme();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthModalMode>('signin');
  const [pathname, setPathname] = useState<string>(() => normalizePath(window.location.pathname));
  const syncedThemeUserRef = useRef<string | null>(null);

  const isPrivacyRoute = pathname === '/privacy';

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = isPrivacyRoute ? 'Privacy Policy — Brainstine' : 'Brainstine';
  }, [isPrivacyRoute]);

  const navigateToPath = useCallback((nextPath: string) => {
    const normalized = normalizePath(nextPath);
    if (normalizePath(window.location.pathname) !== normalized) {
      window.history.pushState(null, '', normalized);
      setPathname(normalized);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!user) {
      syncedThemeUserRef.current = null;
      return;
    }
    if (
      profile &&
      profile.id === user.id &&
      syncedThemeUserRef.current !== user.id &&
      (profile.theme_preference === 'light' ||
        profile.theme_preference === 'dark' ||
        profile.theme_preference === 'system')
    ) {
      syncedThemeUserRef.current = user.id;
      setTheme(profile.theme_preference);
    }
  }, [user, profile, setTheme]);

  useEffect(() => {
    if (isPasswordRecovery) {
      setAuthMode('recovery');
      setAuthModalOpen(true);
    }
  }, [isPasswordRecovery]);

  useEffect(() => {
    if (oauthError && !user) {
      setAuthMode('signin');
      setAuthModalOpen(true);
    }
  }, [oauthError, user]);

  const handleOpenAuth = (mode: AuthModalMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  // Public /privacy route is immediately accessible with zero authentication gate or delay
  if (isPrivacyRoute) {
    return (
      <>
        <PrivacyPolicyPage
          onNavigateHome={() => navigateToPath('/')}
          onOpenAuth={handleOpenAuth}
          isSignedIn={Boolean(user)}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authMode}
          onClose={() => setAuthModalOpen(false)}
        />
      </>
    );
  }

  // Only show session restoration screen if a cached auth session exists; unauthenticated visitors see the public home page immediately
  if (loading && hasStoredAuthSession()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-[#080F1E]">
        <BrandLogo size="md" />
        <p className="mt-4 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
          Restoring your study workspace...
        </p>
      </div>
    );
  }

  return (
    <>
      {user && !isPasswordRecovery ? (
        <DashboardLayout />
      ) : (
        <WelcomePage
          onOpenAuth={handleOpenAuth}
          onNavigateToPrivacy={() => navigateToPath('/privacy')}
        />
      )}

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrainstineRoot />
      </AuthProvider>
    </ThemeProvider>
  );
}

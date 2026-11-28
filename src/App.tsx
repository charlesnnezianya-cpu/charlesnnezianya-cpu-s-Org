import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthModal, type AuthModalMode } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { DashboardLayout } from './components/DashboardLayout';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { WelcomePage } from './components/WelcomePage';

import type { DashboardSection } from './types/brainstine';

const PENDING_SECTION_KEY = 'brainstine-pending-section';
const VALID_SECTIONS: ReadonlySet<DashboardSection> = new Set([
  'overview',
  'history',
  'summarizer',
  'chat',
  'tutor',
  'quizzes',
  'summaries',
  'materials',
  'settings',
]);

function readPendingSection(): DashboardSection | null {
  try {
    const raw = window.sessionStorage?.getItem(PENDING_SECTION_KEY);
    if (raw && VALID_SECTIONS.has(raw as DashboardSection)) {
      return raw as DashboardSection;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writePendingSection(section: DashboardSection | null): void {
  try {
    if (section) {
      window.sessionStorage?.setItem(PENDING_SECTION_KEY, section);
    } else {
      window.sessionStorage?.removeItem(PENDING_SECTION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

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

function hasOAuthCallbackParams(): boolean {
  try {
    const hash = window.location.hash || '';
    const search = new URLSearchParams(window.location.search);
    return (
      hash.includes('access_token=') ||
      hash.includes('refresh_token=') ||
      search.has('code')
    );
  } catch {
    return false;
  }
}

function BrainstineRoot() {
  const { user, profile, loading, isPasswordRecovery, oauthError } = useAuth();
  const { theme, setTheme } = useTheme();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthModalMode>('signin');
  const [pendingSection, setPendingSection] = useState<DashboardSection | null>(() =>
    readPendingSection()
  );
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

  const handleOpenAuth = useCallback(
    (mode: AuthModalMode, targetSection?: DashboardSection) => {
      if (targetSection && VALID_SECTIONS.has(targetSection)) {
        setPendingSection(targetSection);
        writePendingSection(targetSection);
      } else {
        setPendingSection(null);
        writePendingSection(null);
      }
      setAuthMode(mode);
      setAuthModalOpen(true);
    },
    []
  );

  const handleConsumePendingSection = useCallback(() => {
    setPendingSection(null);
    writePendingSection(null);
  }, []);

  // Public /privacy route is immediately accessible with zero authentication gate or delay
  if (isPrivacyRoute) {
    return (
      <>
        <PrivacyPolicyPage
          onNavigateHome={() => navigateToPath('/')}
          onOpenAuth={(mode) => handleOpenAuth(mode)}
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

  // Only show session restoration screen if a cached auth session or active OAuth callback exists; unauthenticated visitors see the public home page immediately
  if (loading && (hasStoredAuthSession() || hasOAuthCallbackParams())) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-[#080F1E]">
        <BrandLogo size="md" />
        <p className="mt-4 text-xs font-medium text-slate-500 select-none dark:text-slate-400">
          {hasOAuthCallbackParams()
            ? 'Completing Google Sign-In...'
            : 'Restoring your study workspace...'}
        </p>
      </div>
    );
  }

  return (
    <>
      {user && !isPasswordRecovery ? (
        <DashboardLayout
          initialSection={pendingSection}
          onConsumeInitialSection={handleConsumePendingSection}
        />
      ) : (
        <WelcomePage
          onOpenAuth={handleOpenAuth}
          onNavigateToPrivacy={() => navigateToPath('/privacy')}
        />
      )}

      <div className={!user && !isPasswordRecovery && theme !== 'light' ? 'dark' : undefined}>
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authMode}
          onClose={() => setAuthModalOpen(false)}
        />
      </div>
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

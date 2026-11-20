import React, { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthModal, type AuthModalMode } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { DashboardLayout } from './components/DashboardLayout';
import { WelcomePage } from './components/WelcomePage';

function BrainstineRoot() {
  const { user, profile, loading, isPasswordRecovery, oauthError } = useAuth();
  const { setTheme } = useTheme();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthModalMode>('signin');
  const syncedThemeUserRef = useRef<string | null>(null);

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

  if (loading) {
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
        <WelcomePage onOpenAuth={handleOpenAuth} />
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

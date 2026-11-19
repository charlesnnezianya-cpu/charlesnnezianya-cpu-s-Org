import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthModal, type AuthModalMode } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { DashboardLayout } from './components/DashboardLayout';
import { WelcomePage } from './components/WelcomePage';

function BrainstineRoot() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthModalMode>('signin');

  useEffect(() => {
    if (isPasswordRecovery) {
      setAuthMode('recovery');
      setAuthModalOpen(true);
    }
  }, [isPasswordRecovery]);

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

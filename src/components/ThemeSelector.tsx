import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { upsertUserProfile } from '../lib/supabase';
import type { ThemeMode } from '../types/brainstine';

interface ThemeSelectorProps {
  compact?: boolean;
}

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme();
  const { user, profile, isConfigured } = useAuth();

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    if (user && isConfigured) {
      const displayName =
        profile?.display_name ||
        (user.user_metadata?.display_name as string | undefined) ||
        user.email?.split('@')[0] ||
        'Student';
      upsertUserProfile({
        id: user.id,
        email: user.email || '',
        display_name: displayName,
        theme_preference: mode,
      }).catch(() => {});
    }
  };

  const options: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <div
      role="group"
      aria-label="Theme preference"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 select-none dark:border-slate-800 dark:bg-slate-900"
    >
      {options.map((opt) => {
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleSelectTheme(opt.id)}
            aria-pressed={active}
            title={`${opt.label} theme`}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              active
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {opt.icon}
            {!compact && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

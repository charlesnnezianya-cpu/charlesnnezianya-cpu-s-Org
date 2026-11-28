import React, { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Download, LogOut, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { sanitizeUserErrorMessage } from '../lib/apiClient';
import { upsertUserProfile } from '../lib/supabase';
import { ThemeSelector } from './ThemeSelector';
import { PWAInstallButton } from './PWAInstallButton';
import {
  getNotificationPreference,
  requestNotificationPermission,
  setNotificationPreference,
  showBrainstineNotification,
} from '../lib/pushNotifications';

export function ProfileSettingsView() {
  const { user, profile, updateDisplayName, updatePassword, signOut } = useAuth();
  const { theme } = useTheme();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(getNotificationPreference());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setFeedback({ type: 'error', text: 'Display name must be at least 2 characters long.' });
      return;
    }
    setSavingName(true);
    try {
      await updateDisplayName(trimmedName);
      if (user) {
        await upsertUserProfile({
          id: user.id,
          email: user.email || profile?.email || '',
          display_name: trimmedName,
          theme_preference: theme,
        });
      }
      setFeedback({ type: 'success', text: 'Profile and preferences updated.' });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: sanitizeUserErrorMessage(err, 'updating your profile'),
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.length < 8) {
      setFeedback({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', text: 'Account password updated successfully.' });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: sanitizeUserErrorMessage(err, 'updating your password'),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleTogglePush = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    if (checked) {
      const granted = await requestNotificationPermission();
      setPushEnabled(granted);
      setNotificationPreference(granted);
      if (granted) {
        setFeedback({ type: 'success', text: 'Push notifications enabled successfully.' });
      } else {
        setFeedback({ type: 'error', text: 'Notification permission was denied in browser settings.' });
      }
    } else {
      setPushEnabled(false);
      setNotificationPreference(false);
      setFeedback({ type: 'success', text: 'Push notifications disabled.' });
    }
  };

  const handleTestNotification = () => {
    showBrainstineNotification({
      title: 'Brainstine Test Notification',
      body: 'Push notifications are fully operational! You will receive updates for completed summaries and AI replies.',
      tag: 'test-notification',
      url: window.location.origin,
    });
    setFeedback({ type: 'success', text: 'Test notification dispatched.' });
  };

  return (
    <div className="max-w-3xl space-y-6">
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Profile Details */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <h2 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
          Profile & Display Preferences
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Update how Brainstine addresses you and choose your preferred appearance.
        </p>

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="settings-display-name"
              className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
            >
              Display Name
            </label>
            <input
              id="settings-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none sm:min-h-10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="settings-email"
              className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
            >
              Account Email
            </label>
            <input
              id="settings-email"
              type="email"
              disabled
              value={user?.email || profile?.email || ''}
              placeholder="No email linked to this account"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 sm:min-h-10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"
            />
          </div>

          {(user?.phone || profile?.phone) && (
            <div>
              <label
                htmlFor="settings-phone"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Account Phone
              </label>
              <input
                id="settings-phone"
                type="tel"
                disabled
                value={user?.phone || profile?.phone || ''}
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500 sm:min-h-10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400"
              />
            </div>
          )}

          <div className="flex flex-col justify-between gap-3 pt-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-medium text-slate-700 select-none dark:text-slate-300">
                Interface Theme
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Choose Light, Dark, or follow your device system theme.
              </p>
            </div>
            <ThemeSelector />
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-4 select-none dark:border-slate-800">
            <button
              type="submit"
              disabled={savingName}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#192F5D] disabled:opacity-60 sm:min-h-9 sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{savingName ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Notifications & PWA Installation */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
              Notifications &amp; Installation
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Manage background alerts for completed summaries and AI responses, and install Brainstine.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-900 select-none dark:text-white">
                Background Push Notifications
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Receive real-time alerts when document summaries are ready or AI tutor replies.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={handleTogglePush}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:border-slate-700 dark:bg-slate-700" />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
            <button
              type="button"
              onClick={handleTestNotification}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Send Test Notification</span>
            </button>

            <div className="w-full sm:w-auto">
              <PWAInstallButton />
            </div>
          </div>
        </div>
      </section>

      {/* Password Security */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <h2 className="font-display text-lg font-bold text-slate-900 select-none dark:text-white">
          Security & Password
        </h2>
        <form onSubmit={handleUpdatePassword} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-new-pw"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                New Password
              </label>
              <input
                id="settings-new-pw"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none sm:min-h-10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="settings-confirm-pw"
                className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
              >
                Confirm New Password
              </label>
              <input
                id="settings-confirm-pw"
                type="password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 select-text focus:border-blue-600 focus:outline-none sm:min-h-10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex justify-end select-none">
            <button
              type="submit"
              disabled={savingPassword}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 sm:min-h-9 sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>

      {/* Sign Out */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:p-6 dark:border-slate-800 dark:bg-[#0D162B]">
        <div>
          <h3 className="font-display text-sm font-bold text-slate-900 select-none dark:text-white">
            Session
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Sign out of Brainstine on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 select-none sm:min-h-9 sm:w-auto dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </section>
    </div>
  );
}

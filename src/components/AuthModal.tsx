import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeUserErrorMessage } from '../lib/apiClient';
import { BrandLogo } from './BrandLogo';

export type AuthModalMode = 'signin' | 'signup' | 'forgot' | 'recovery';
type CredentialChannel = 'email' | 'phone';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthModalMode;
  onClose: () => void;
}

export function AuthModal({ isOpen, initialMode, onClose }: AuthModalProps) {
  const {
    isConfigured,
    oauthError,
    pendingOauthUrl,
    signInWithEmail,
    signUpWithEmail,
    requestPhoneOtp,
    verifyPhoneOtp,
    signInWithGoogle,
    requestPasswordReset,
    updatePassword,
    clearPasswordRecovery,
    clearOauthError,
    clearPendingOauthUrl,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [channel, setChannel] = useState<CredentialChannel>('email');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [optionalLinkEmail, setOptionalLinkEmail] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [recoveryComplete, setRecoveryComplete] = useState(false);

  React.useEffect(() => {
    setMode(initialMode);
    setChannel('email');
    setPhoneOtpSent(false);
    setPhoneOtpCode('');
    setErrorMsg(null);
    setVerificationSentTo(null);
    setResetSentTo(null);
    setRecoveryComplete(false);
  }, [initialMode, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'recovery') {
          clearPasswordRecovery();
        }
        clearOauthError();
        clearPendingOauthUrl();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, mode, clearPasswordRecovery, clearOauthError, clearPendingOauthUrl, onClose]);

  if (!isOpen) return null;

  const switchMode = (next: AuthModalMode) => {
    setMode(next);
    setPhoneOtpSent(false);
    setPhoneOtpCode('');
    setErrorMsg(null);
    clearOauthError();
    clearPendingOauthUrl();
    setVerificationSentTo(null);
    setResetSentTo(null);
  };

  const switchChannel = (next: CredentialChannel) => {
    setChannel(next);
    setPhoneOtpSent(false);
    setPhoneOtpCode('');
    setErrorMsg(null);
    clearOauthError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isConfigured) {
      setErrorMsg(
        'Account sign-in is temporarily unavailable. Please try again shortly.'
      );
      return;
    }

    if ((mode === 'signin' || mode === 'signup') && channel === 'phone') {
      if (mode === 'signup' && (!displayName.trim() || displayName.trim().length < 2)) {
        setErrorMsg('Please enter your display name (at least 2 characters).');
        return;
      }

      setSubmitting(true);
      try {
        if (!phoneOtpSent) {
          await requestPhoneOtp({
            phone,
            displayName: mode === 'signup' ? displayName : undefined,
            mode,
          });
          setPhoneOtpSent(true);
        } else {
          if (phoneOtpCode.trim().length < 4) {
            setErrorMsg('Please enter the verification code sent to your phone.');
            setSubmitting(false);
            return;
          }
          const result = await verifyPhoneOtp({
            phone,
            token: phoneOtpCode,
            displayName: mode === 'signup' ? displayName : undefined,
            linkEmail: mode === 'signup' ? optionalLinkEmail : undefined,
          });
          if (result.emailVerificationPending && optionalLinkEmail.trim()) {
            setVerificationSentTo(optionalLinkEmail.trim());
          } else {
            onClose();
          }
        }
      } catch (err: unknown) {
        setErrorMsg(sanitizeUserErrorMessage(err, 'sign in'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'signup') {
      if (!displayName.trim() || displayName.trim().length < 2) {
        setErrorMsg('Please enter your display name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please verify both fields.');
        return;
      }
    }

    if (mode === 'recovery') {
      if (password.length < 8) {
        setErrorMsg('New password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please verify both fields.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail({ email, password });
        onClose();
      } else if (mode === 'signup') {
        const result = await signUpWithEmail({
          email,
          password,
          displayName,
        });
        if (result.needsEmailVerification) {
          setVerificationSentTo(email.trim());
        } else {
          onClose();
        }
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setResetSentTo(email.trim());
      } else if (mode === 'recovery') {
        await updatePassword(password);
        setRecoveryComplete(true);
      }
    } catch (err: unknown) {
      setErrorMsg(sanitizeUserErrorMessage(err, 'sign in'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    clearOauthError();
    if (!isConfigured) {
      setErrorMsg('Google Sign-In is temporarily unavailable. Please try again shortly.');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setErrorMsg(sanitizeUserErrorMessage(err, 'sign in'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (mode === 'recovery') {
      clearPasswordRecovery();
    }
    clearOauthError();
    clearPendingOauthUrl();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#0D162B] sm:p-8">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close authentication modal"
          className="absolute top-3.5 right-3.5 inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 select-none sm:top-4 sm:right-4 sm:h-9 sm:w-9 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="mb-6">
          <BrandLogo size="sm" />
          <h2
            id="auth-modal-title"
            className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900 select-none dark:text-white"
          >
            {mode === 'signin' && 'Sign in to Brainstine'}
            {mode === 'signup' && 'Create your student account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'recovery' && 'Set a new password'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {mode === 'signin' && 'Access your saved summaries, uploaded materials, and study history.'}
            {mode === 'signup' && 'Personalize your workspace and sync your academic notes securely.'}
            {mode === 'forgot' && 'Enter your account email and we will send a recovery link.'}
            {mode === 'recovery' && 'Choose a strong password for your Brainstine account.'}
          </p>
        </div>

        {!isConfigured && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold select-none">Sign-In Temporarily Unavailable</p>
                <p className="leading-relaxed">
                  Account sign-in and cloud library sync are temporarily unavailable right now.
                  Please try again shortly.
                </p>
              </div>
            </div>
          </div>
        )}

        {(errorMsg || oauthError) && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{errorMsg || oauthError}</span>
          </div>
        )}

        {pendingOauthUrl && (
          <div className="mb-5 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-slate-200">
            <p className="leading-relaxed">
              Google Sign-In cannot open inside an embedded preview frame. Open Google Sign-In in a full browser tab to continue:
            </p>
            <a
              href={pendingOauthUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => clearPendingOauthUrl()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1E3D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <span>Continue to Google Sign-In</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        )}

        {verificationSentTo ? (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-emerald-950 select-none dark:text-emerald-200">
                  Verify your email address
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-emerald-800 dark:text-emerald-300">
                  We sent a verification link to <span className="font-medium">{verificationSentTo}</span>.
                  Open the link in your inbox to activate your account and sign in.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Return to Sign In
            </button>
          </div>
        ) : resetSentTo ? (
          <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-slate-900 select-none dark:text-white">
                  Reset email dispatched
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  If an account exists for <span className="font-medium">{resetSentTo}</span>, a password
                  reset link has been sent.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Back to Sign In
            </button>
          </div>
        ) : recoveryComplete ? (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-emerald-950 select-none dark:text-emerald-200">
                  Password updated
                </h3>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                  Your password has been reset. You can now continue into your dashboard.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 select-none"
            >
              Continue to Brainstine
            </button>
          </div>
        ) : (
          <>
            {(mode === 'signin' || mode === 'signup') && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 select-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                <p className="mt-2 text-center text-[11px] text-slate-500 select-none dark:text-slate-400">
                  Secured by Brainstine authentication
                </p>

                <div className="my-5 flex items-center gap-3 select-none">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    or continue with
                  </span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>

                <div
                  role="tablist"
                  aria-label="Sign-in method"
                  className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 select-none dark:border-slate-800 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={channel === 'email'}
                    onClick={() => switchChannel('email')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                      channel === 'email'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Email</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={channel === 'phone'}
                    onClick={() => switchChannel('phone')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                      channel === 'phone'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Phone</span>
                  </button>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label
                    htmlFor="auth-display-name"
                    className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                  >
                    Display name
                  </label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-display-name"
                      type="text"
                      required
                      disabled={channel === 'phone' && phoneOtpSent}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Jordan Alvarez"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                    />
                  </div>
                </div>
              )}

              {(mode === 'signin' || mode === 'signup') && channel === 'phone' ? (
                <>
                  <div>
                    <label
                      htmlFor="auth-phone"
                      className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                    >
                      Phone number (with country code)
                    </label>
                    <div className="relative">
                      <Phone
                        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="auth-phone"
                        type="tel"
                        required
                        disabled={phoneOtpSent}
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 415 555 2671"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                      />
                    </div>
                  </div>

                  {mode === 'signup' && !phoneOtpSent && (
                    <div>
                      <label
                        htmlFor="auth-phone-email"
                        className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                      >
                        Email address{' '}
                        <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-phone-email"
                          type="email"
                          autoComplete="email"
                          value={optionalLinkEmail}
                          onChange={(e) => setOptionalLinkEmail(e.target.value)}
                          placeholder="student@university.edu"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  {phoneOtpSent && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor="auth-phone-otp"
                          className="block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                        >
                          SMS verification code
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneOtpSent(false);
                            setPhoneOtpCode('');
                            setErrorMsg(null);
                          }}
                          className="text-xs font-medium text-blue-600 hover:underline select-none dark:text-blue-400"
                        >
                          Change number
                        </button>
                      </div>
                      <div className="relative">
                        <ShieldCheck
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-phone-otp"
                          type="text"
                          inputMode="numeric"
                          required
                          autoComplete="one-time-code"
                          value={phoneOtpCode}
                          onChange={(e) => setPhoneOtpCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm tracking-wider text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-60 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <span>
                      {submitting
                        ? 'Processing...'
                        : !phoneOtpSent
                          ? 'Send Verification Code'
                          : mode === 'signup'
                            ? 'Verify & Create Account'
                            : 'Verify & Sign In'}
                    </span>
                    {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </>
              ) : (
                <>
                  {mode !== 'recovery' && (
                    <div>
                      <label
                        htmlFor="auth-email"
                        className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                      >
                        Academic or personal email
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="student@university.edu"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  {mode !== 'forgot' && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor="auth-password"
                          className="block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                        >
                          {mode === 'recovery' ? 'New password' : 'Password'}
                        </label>
                        {mode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 select-none dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={mode === 'signin' ? 6 : 8}
                          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute top-1/2 right-1.5 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 select-none dark:hover:text-slate-200"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {(mode === 'signup' || mode === 'recovery') && (
                    <div>
                      <label
                        htmlFor="auth-confirm-password"
                        className="mb-1.5 block text-xs font-medium text-slate-700 select-none dark:text-slate-300"
                      >
                        Confirm password
                      </label>
                      <div className="relative">
                        <KeyRound
                          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <input
                          id="auth-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3.5 pl-9.5 text-sm text-slate-900 select-text focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:bg-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F1E3D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#192F5D] disabled:opacity-60 select-none dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <span>
                      {submitting
                        ? 'Processing...'
                        : mode === 'signin'
                          ? 'Sign In'
                          : mode === 'signup'
                            ? 'Create Account'
                            : mode === 'forgot'
                              ? 'Send Reset Link'
                              : 'Update Password'}
                    </span>
                    {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </>
              )}
            </form>

            <div className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-600 select-none dark:border-slate-800 dark:text-slate-400">
              {mode === 'signin' && (
                <>
                  New to Brainstine?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Create an account
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Sign in
                  </button>
                </>
              )}
              {mode === 'forgot' && (
                <>
                  Remembered your password?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

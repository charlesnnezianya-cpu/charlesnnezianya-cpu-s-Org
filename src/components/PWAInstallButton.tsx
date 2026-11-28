import React, { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Laptop, Share, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          return;
        }
      } catch {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Install Brainstine as a native app on your phone, tablet, or desktop"
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 shadow-xs transition-colors hover:border-[#1D4ED8]/40 hover:bg-slate-50 hover:text-[#1D4ED8] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-sky-400/40 dark:hover:text-sky-300 ${
          compact ? 'min-h-10 px-3 py-1.5 text-xs' : 'min-h-10 w-full px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8] dark:text-sky-400" />
        <span className="font-semibold">Install Brainstine</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0D162B]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1D4ED8] dark:bg-blue-950/60 dark:text-sky-400">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="pwa-install-guide-title"
                    className="font-display text-base font-bold text-slate-900 select-none dark:text-white"
                  >
                    Install Brainstine App
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fast access, offline capabilities &amp; native performance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
              {isIOS ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <Smartphone className="h-4 w-4 text-[#1D4ED8] dark:text-sky-400" />
                    <span>iPhone &amp; iPad (Safari)</span>
                  </div>
                  <ol className="space-y-2 pl-1">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-sky-300">
                        1
                      </span>
                      <span>
                        Tap the <strong>Share</strong> button <Share className="mx-1 inline h-3.5 w-3.5 text-slate-500" /> at the bottom of Safari.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-sky-300">
                        2
                      </span>
                      <span>
                        Scroll down and tap <strong>Add to Home Screen</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-sky-300">
                        3
                      </span>
                      <span>
                        Tap <strong>Add</strong> in the top-right corner.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    <Laptop className="h-4 w-4 text-[#1D4ED8] dark:text-sky-400" />
                    <span>Android &amp; Desktop (Chrome, Edge, Brave)</span>
                  </div>
                  <ol className="space-y-2 pl-1">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-sky-300">
                        1
                      </span>
                      <span>
                        Look for the <strong>Install App</strong> icon <Download className="mx-1 inline h-3 w-3 text-slate-500" /> on the right side of your browser address bar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 font-mono text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-sky-300">
                        2
                      </span>
                      <span>
                        Or click the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) and select <strong>Install Brainstine</strong> or <strong>Add to Home screen</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-slate-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-slate-300">
                <p className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Installed App Benefits</span>
                </p>
                <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <li>Full-screen distraction-free academic workspace</li>
                  <li>Instant loading with offline cached study materials</li>
                  <li>Real-time background notifications for completed summaries</li>
                </ul>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-10 w-full rounded-xl bg-[#0F1E3D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#192F5D] dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

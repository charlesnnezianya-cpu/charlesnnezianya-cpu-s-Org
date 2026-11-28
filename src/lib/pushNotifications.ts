export interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
}

const NOTIFICATION_PREF_KEY = 'brainstine_push_enabled';

export function getNotificationPreference(): boolean {
  try {
    const val = localStorage.getItem(NOTIFICATION_PREF_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setNotificationPreference(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_PREF_KEY, String(enabled));
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    setNotificationPreference(true);
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setNotificationPreference(granted);
    return granted;
  }
  return false;
}

export async function showBrainstineNotification(payload: PushNotificationPayload): Promise<void> {
  if (!getNotificationPreference()) return;
  if (!('Notification' in window)) return;

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag || 'brainstine-notification',
        data: {
          url: payload.url || window.location.origin,
        },
      });
      return;
    }
  } catch {
    // Fallback to standard Notification constructor
  }

  try {
    const n = new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/pwa-192x192.png',
      tag: payload.tag || 'brainstine-notification',
    });
    n.onclick = () => {
      window.focus();
      if (payload.url) {
        window.location.href = payload.url;
      }
      n.close();
    };
  } catch {}
}

export function notifyDocumentSummaryCompleted(summaryTitle: string, summaryId?: string): void {
  showBrainstineNotification({
    title: 'Document Summary Ready',
    body: `Your structured academic study notes for "${summaryTitle}" have been successfully generated.`,
    tag: `summary-${summaryId || Date.now()}`,
    url: `${window.location.origin}/`,
  });
}

export function notifyChatbotReply(preview: string, sessionId?: string): void {
  showBrainstineNotification({
    title: 'New AI Chatbot Reply',
    body: preview.length > 90 ? `${preview.slice(0, 87)}...` : preview,
    tag: `chat-${sessionId || Date.now()}`,
    url: `${window.location.origin}/`,
  });
}

export function notifyTutorReply(preview: string, sessionId?: string): void {
  showBrainstineNotification({
    title: 'Personal AI Tutor Responded',
    body: preview.length > 90 ? `${preview.slice(0, 87)}...` : preview,
    tag: `tutor-${sessionId || Date.now()}`,
    url: `${window.location.origin}/`,
  });
}

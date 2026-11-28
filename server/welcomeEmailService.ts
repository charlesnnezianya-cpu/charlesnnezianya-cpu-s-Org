import fs from 'node:fs/promises';
import path from 'node:path';
import { getSupabaseServerConfig } from './documentEngine.ts';
import { logServerError, logServerWarn } from './errorHandler.ts';

export const WELCOME_EMAIL_SUBJECT =
  'Welcome to Brainstine — Your Academic Journey Starts Here!';

export type WelcomeEmailStatus =
  | 'sent'
  | 'already_sent'
  | 'in_progress'
  | 'skipped_no_email'
  | 'skipped_existing_account'
  | 'not_configured'
  | 'failed';

export type WelcomeAuthEvent =
  | 'signup'
  | 'oauth_callback'
  | 'email_verified'
  | 'phone_verified'
  | 'email_linked_after_phone_signup'
  | 'session_check';

export interface SupabaseVerifiedUser {
  id: string;
  email?: string | null;
  new_email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: Record<string, unknown>;
}

export interface WelcomeEmailOutcome {
  ok: boolean;
  status: WelcomeEmailStatus;
  provider: 'resend' | 'none';
  messageId?: string | null;
  reason?: string;
}

const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';
const LOGO_CID = 'brainstine-logo';
const NEW_ACCOUNT_WINDOW_MS = 20 * 60 * 1000;
const LINKED_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 6000;
const PROVIDER_TIMEOUT_MS = 10000;

// Process-level fallback lock & deduplication (used concurrently + if DB migration columns aren't applied yet)
const inFlightUsers = new Map<string, Promise<WelcomeEmailOutcome>>();
const memoryDeliveredUsers = new Set<string>();
let cachedLogoBase64: string | null | undefined;
let loggedMissingSchemaWarning = false;

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isResendConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || '').trim());
}

export function getWelcomeSenderAddress(): string {
  const configured = (
    process.env.WELCOME_EMAIL_FROM ||
    process.env.WELCOME_SENDER_EMAIL ||
    ''
  ).trim();
  if (configured) {
    return configured.includes('<') ? configured : `Brainstine <${configured}>`;
  }
  return 'Brainstine <welcome@brainstine.com>';
}

export function resolvePublicAppUrl(requestOrigin?: string | null): string {
  const candidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//i, '')}`
      : '',
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//i, '')}`
      : '',
    requestOrigin || '',
  ];

  for (const raw of candidates) {
    const trimmed = (raw || '').trim().replace(/\/+$/, '');
    if (!trimmed || trimmed === 'MY_APP_URL') continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Ignore malformed candidate
    }
  }
  return 'https://brainstine.com';
}

export function resolveLogoImageUrl(requestOrigin?: string | null): string | null {
  const explicit = (process.env.WELCOME_LOGO_URL || '').trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      // Ignore malformed explicit logo URL
    }
  }

  const candidates = [
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//i, '')}`
      : '',
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//i, '')}`
      : '',
    requestOrigin || '',
  ];

  for (const raw of candidates) {
    const trimmed = (raw || '').trim().replace(/\/+$/, '');
    if (!trimmed || trimmed === 'MY_APP_URL') continue;
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.protocol === 'https:' &&
        !parsed.hostname.includes('localhost') &&
        !parsed.hostname.startsWith('127.')
      ) {
        return `${parsed.origin}/brainstine-logo.png`;
      }
    } catch {
      // Ignore malformed URL
    }
  }

  return null;
}

async function readLocalBrainstineLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64 !== undefined) return cachedLogoBase64;
  const candidatePaths = [
    path.resolve(process.cwd(), 'public', 'brainstine-logo.png'),
    path.resolve(process.cwd(), 'dist', 'brainstine-logo.png'),
  ];
  for (const filePath of candidatePaths) {
    try {
      const bytes = await fs.readFile(filePath);
      if (bytes.length > 0) {
        cachedLogoBase64 = bytes.toString('base64');
        return cachedLogoBase64;
      }
    } catch {
      // Try next path
    }
  }
  cachedLogoBase64 = null;
  return null;
}

export function __unsafeSetCachedLogoBase64ForTest(value: string | null | undefined): void {
  cachedLogoBase64 = value;
}

export function resolveUserDisplayName(user: SupabaseVerifiedUser): string {
  const meta = user.user_metadata || {};
  const candidates = [
    typeof meta.display_name === 'string' ? meta.display_name : '',
    typeof meta.full_name === 'string' ? meta.full_name : '',
    typeof meta.name === 'string' ? meta.name : '',
    typeof user.email === 'string' && user.email.includes('@') ? user.email.split('@')[0] : '',
  ];
  for (const candidate of candidates) {
    const cleaned = candidate.trim().replace(/\s+/g, ' ');
    if (cleaned) return cleaned.slice(0, 80);
  }
  return 'Learner';
}

export function resolveVerifiedRecipientEmail(user: SupabaseVerifiedUser): string | null {
  const primary = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (primary && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary)) {
    return primary;
  }
  return null;
}

export function isNewAccountWelcomeEligible(
  user: SupabaseVerifiedUser,
  authEvent: WelcomeAuthEvent = 'session_check',
  nowMs: number = Date.now()
): { eligible: boolean; reason: string } {
  const createdMs = user.created_at ? Date.parse(user.created_at) : NaN;
  const confirmedMs = Date.parse(user.email_confirmed_at || user.confirmed_at || '');
  const phoneConfirmedMs = user.phone_confirmed_at ? Date.parse(user.phone_confirmed_at) : NaN;
  const lastSignInMs = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;

  if (Number.isFinite(createdMs) && nowMs - createdMs <= NEW_ACCOUNT_WINDOW_MS && nowMs - createdMs >= -60_000) {
    return { eligible: true, reason: 'recent_account_creation' };
  }

  // Delayed email-verification confirmation click shortly followed by first session
  if (
    Number.isFinite(confirmedMs) &&
    nowMs - confirmedMs <= NEW_ACCOUNT_WINDOW_MS &&
    nowMs - confirmedMs >= -60_000 &&
    (!Number.isFinite(lastSignInMs) || Math.abs(lastSignInMs - confirmedMs) <= 10 * 60 * 1000)
  ) {
    return { eligible: true, reason: 'recent_email_verification_first_login' };
  }

  // Phone verification right after phone account creation
  if (
    authEvent === 'phone_verified' &&
    Number.isFinite(phoneConfirmedMs) &&
    nowMs - phoneConfirmedMs <= NEW_ACCOUNT_WINDOW_MS
  ) {
    return { eligible: true, reason: 'recent_phone_verification' };
  }

  // Phone signup user linking their email shortly after creating the account
  if (
    authEvent === 'email_linked_after_phone_signup' &&
    Number.isFinite(createdMs) &&
    nowMs - createdMs <= LINKED_EMAIL_WINDOW_MS
  ) {
    return { eligible: true, reason: 'email_linked_after_phone_signup' };
  }

  return { eligible: false, reason: 'existing_account_signin' };
}

export function buildWelcomeEmailText(displayName: string): string {
  const safeName = (displayName || '').trim() || 'Learner';
  return [
    `Hello ${safeName},`,
    '',
    'Welcome to Brainstine!',
    '',
    "We're delighted to have you join our learning community.",
    '',
    'Brainstine is your intelligent academic companion, built to make learning smarter, simpler, and more effective. From understanding complex topics and summarizing study materials to practising questions and preparing for examinations, Brainstine gives you the tools to take control of your learning.',
    '',
    "Your academic journey just got smarter, and we're excited to be part of it.",
    '',
    'Start exploring, keep learning, and make every study session count.',
    '',
    'Happy Learning!',
    'The Brainstine Team',
  ].join('\n');
}

export function buildWelcomeEmailHtml(params: {
  displayName: string;
  logoSrc?: string | null;
  ctaUrl: string;
}): string {
  const safeName = escapeHtml((params.displayName || '').trim() || 'Learner');
  const rawLogoSrc = (params.logoSrc || '').trim();
  const safeLogoSrc = rawLogoSrc ? escapeHtml(rawLogoSrc) : '';
  const safeCtaUrl = escapeHtml(params.ctaUrl);
  const year = new Date().getUTCFullYear();

  const headerBrandHtml = safeLogoSrc
    ? `<img
                src="${safeLogoSrc}"
                alt="Brainstine"
                width="250"
                height="73"
                style="display: block; margin: 0 auto 10px auto; max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 28px; font-weight: 800; color: #0F1E3D; line-height: 1.2;"
              />
              <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #475569;">
                Intelligent Academic Companion
              </div>`
    : `<div style="font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #0F1E3D; line-height: 1.2; margin: 0 auto 8px auto;">
                Brain<span style="color: #1D4ED8;">stine</span>
              </div>
              <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #475569;">
                Intelligent Academic Companion
              </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(WELCOME_EMAIL_SUBJECT)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-wrapper { padding: 20px 12px !important; }
      .email-header { padding: 26px 24px 18px 24px !important; }
      .email-body { padding: 30px 24px 26px 24px !important; }
      .email-footer { padding: 20px 24px !important; }
      .cta-button { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0F172A; -webkit-font-smoothing: antialiased;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
    Welcome to Brainstine! Your academic journey just got smarter — start exploring study summaries, AI tutoring, and practice exams.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-wrapper" style="background-color: #F1F5F9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px; background-color: #FFFFFF; border-radius: 18px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);">
          <!-- Header with Brainstine Brand Logo (falls back cleanly to typography if image unavailable) -->
          <tr>
            <td class="email-header" align="center" style="background-color: #FFFFFF; padding: 32px 40px 22px 40px; text-align: center;">
              ${headerBrandHtml}
            </td>
          </tr>

          <!-- Accent Divider -->
          <tr>
            <td style="height: 3px; background-color: #1D4ED8; background-image: linear-gradient(90deg, #0F1E3D 0%, #1D4ED8 55%, #0EA5E9 100%); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td class="email-body" style="padding: 38px 42px 32px 42px; text-align: left;">
              <h1 style="margin: 0 0 18px 0; font-size: 22px; font-weight: 700; color: #0F172A; line-height: 1.35;">
                Hello ${safeName},
              </h1>

              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1D4ED8; line-height: 1.5;">
                Welcome to Brainstine!
              </p>

              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.65;">
                We're delighted to have you join our learning community.
              </p>

              <p style="margin: 0 0 18px 0; font-size: 15px; color: #334155; line-height: 1.65;">
                Brainstine is your intelligent academic companion, built to make learning smarter, simpler, and more effective. From understanding complex topics and summarizing study materials to practising questions and preparing for examinations, Brainstine gives you the tools to take control of your learning.
              </p>

              <p style="margin: 0 0 24px 0; font-size: 15px; color: #334155; line-height: 1.65;">
                Your academic journey just got smarter, and we're excited to be part of it.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 26px 0;">
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #1D4ED8; border-radius: 10px; padding: 16px 18px;">
                    <p style="margin: 0; font-size: 14px; font-weight: 500; color: #1E293B; line-height: 1.6;">
                      Start exploring, keep learning, and make every study session count.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #0F1E3D;">
                    <a
                      href="${safeCtaUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="cta-button"
                      style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 10px; background-color: #0F1E3D;"
                    >
                      Start Exploring Brainstine &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: #0F172A; line-height: 1.5;">
                Happy Learning!
              </p>
              <p style="margin: 0; font-size: 15px; font-weight: 500; color: #475569; line-height: 1.5;">
                The Brainstine Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 22px 42px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748B; line-height: 1.5;">
                You received this email because you created a new Brainstine account.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94A3B8; line-height: 1.5;">
                &copy; ${year} Brainstine. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function fetchVerifiedSupabaseUserFromBearer(
  authHeader?: string | string[]
): Promise<{ user: SupabaseVerifiedUser; accessToken: string } | null> {
  if (!authHeader) return null;
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const match = headerStr.trim().match(/^Bearer\s+(.+)$/i);
  const accessToken = match ? match[1].trim() : '';
  if (!accessToken) return null;

  const cfg = getSupabaseServerConfig();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SupabaseVerifiedUser;
    if (!data?.id || typeof data.id !== 'string') return null;
    return { user: data, accessToken };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isMissingColumnOrTableError(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('42703') ||
    lower.includes('pgrst204') ||
    lower.includes('pgrst205') ||
    lower.includes('does not exist') ||
    lower.includes('could not find the')
  );
}

async function claimProfileWelcomeSlot(
  user: SupabaseVerifiedUser,
  accessToken: string
): Promise<'claimed' | 'already_sent' | 'schema_missing'> {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return 'schema_missing';

  const baseHeaders = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
  try {
    // 1. Check current profile status first
    const getRes = await fetch(
      `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,welcome_email_status,welcome_email_sent_at&limit=1`,
      { headers: baseHeaders, signal: controller.signal }
    );

    if (!getRes.ok) {
      const errTxt = await getRes.text().catch(() => '');
      if (isMissingColumnOrTableError(getRes.status, errTxt)) {
        return 'schema_missing';
      }
      // Fall back to process-level dedupe on transient DB read error
      return memoryDeliveredUsers.has(user.id) ? 'already_sent' : 'claimed';
    }

    const rows = (await getRes.json()) as Array<{
      id?: string;
      welcome_email_status?: string | null;
      welcome_email_sent_at?: string | null;
    }>;

    const existing = rows[0];
    if (
      existing?.welcome_email_sent_at ||
      existing?.welcome_email_status === 'sent' ||
      existing?.welcome_email_status === 'sending'
    ) {
      return 'already_sent';
    }

    // 2. If profile row somehow doesn't exist yet, create it cleanly with upsert
    if (!existing) {
      await fetch(`${cfg.url}/rest/v1/profiles?on_conflict=id`, {
        method: 'POST',
        headers: { ...baseHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          id: user.id,
          email: user.email || '',
          phone: user.phone || null,
          display_name: resolveUserDisplayName(user),
        }),
        signal: controller.signal,
      }).catch(() => {});
    }

    // 3. Atomic conditional claim so concurrent requests (e.g. signup + onAuthStateChange) never send twice
    const claimUrl =
      `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}` +
      `&welcome_email_sent_at=is.null` +
      `&or=(welcome_email_status.is.null,welcome_email_status.in.(failed,not_configured,skipped_no_email,skipped_existing_account))`;

    const patchRes = await fetch(claimUrl, {
      method: 'PATCH',
      headers: { ...baseHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        welcome_email_status: 'sending',
        welcome_email_error: null,
        updated_at: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!patchRes.ok) {
      const errTxt = await patchRes.text().catch(() => '');
      if (isMissingColumnOrTableError(patchRes.status, errTxt)) {
        return 'schema_missing';
      }
      return memoryDeliveredUsers.has(user.id) ? 'already_sent' : 'claimed';
    }

    const claimedRows = (await patchRes.json()) as Array<{ id?: string }>;
    return claimedRows.length > 0 ? 'claimed' : 'already_sent';
  } catch {
    return memoryDeliveredUsers.has(user.id) ? 'already_sent' : 'claimed';
  } finally {
    clearTimeout(timer);
  }
}

async function recordProfileWelcomeOutcome(params: {
  userId: string;
  accessToken: string;
  recipientEmail: string | null;
  authProvider: string;
  status: WelcomeEmailStatus;
  provider: 'resend' | 'none';
  messageId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return;

  const baseHeaders = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${params.accessToken}`,
    'Content-Type': 'application/json',
  };

  const nowIso = new Date().toISOString();
  const safeError = params.errorMessage ? params.errorMessage.slice(0, 400) : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS);
  try {
    const patchRes = await fetch(
      `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(params.userId)}`,
      {
        method: 'PATCH',
        headers: { ...baseHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          welcome_email_status: params.status,
          welcome_email_sent_at: params.status === 'sent' ? nowIso : null,
          welcome_email_provider: params.provider,
          welcome_email_message_id: params.messageId ?? null,
          welcome_email_error: safeError,
          updated_at: nowIso,
        }),
        signal: controller.signal,
      }
    );

    if (!patchRes.ok) {
      const errTxt = await patchRes.text().catch(() => '');
      if (isMissingColumnOrTableError(patchRes.status, errTxt) && !loggedMissingSchemaWarning) {
        loggedMissingSchemaWarning = true;
        logServerWarn(
          'auth.welcome_email',
          'Database migration columns for welcome email tracking are not yet applied in profiles.'
        );
      }
    }

    // Best-effort insert into audit log table
    await fetch(`${cfg.url}/rest/v1/welcome_email_logs`, {
      method: 'POST',
      headers: { ...baseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: params.userId,
        recipient_email: params.recipientEmail,
        auth_provider: params.authProvider,
        email_provider: params.provider,
        status: params.status,
        provider_message_id: params.messageId ?? null,
        error_message: safeError,
      }),
      signal: controller.signal,
    }).catch(() => {});
  } catch {
    // Non-fatal logging fallback
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWelcomeEmailViaResend(params: {
  email: string;
  displayName: string;
  requestOrigin?: string | null;
}): Promise<{
  ok: boolean;
  status: 'sent' | 'not_configured' | 'failed';
  provider: 'resend' | 'none';
  messageId?: string | null;
  error?: string;
}> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'none',
      error: 'Email delivery provider is not configured on the server.',
    };
  }

  let logoSrc: string | null = null;
  let inlineAttachments:
    | Array<{
        filename: string;
        content: string;
        content_id: string;
        content_type: string;
      }>
    | undefined;

  const explicitLogoUrl = (process.env.WELCOME_LOGO_URL || '').trim();
  if (explicitLogoUrl) {
    logoSrc = resolveLogoImageUrl(params.requestOrigin);
  }

  if (!logoSrc) {
    try {
      const logoBase64 = await readLocalBrainstineLogoBase64();
      if (logoBase64) {
        logoSrc = `cid:${LOGO_CID}`;
        inlineAttachments = [
          {
            filename: 'brainstine-logo.png',
            content: logoBase64,
            content_id: LOGO_CID,
            content_type: 'image/png',
          },
        ];
      }
    } catch {
      // Continue gracefully without local attachment if unavailable
    }
  }

  if (!logoSrc) {
    logoSrc = resolveLogoImageUrl(params.requestOrigin);
  }

  const ctaUrl = resolvePublicAppUrl(params.requestOrigin);
  const html = buildWelcomeEmailHtml({
    displayName: params.displayName,
    logoSrc,
    ctaUrl,
  });
  const text = buildWelcomeEmailText(params.displayName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const payload: Record<string, unknown> = {
      from: getWelcomeSenderAddress(),
      to: [params.email],
      subject: WELCOME_EMAIL_SUBJECT,
      html,
      text,
    };
    if (inlineAttachments) {
      payload.attachments = inlineAttachments;
    }

    const res = await fetch(RESEND_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: 'failed',
        provider: 'resend',
        error: `Provider HTTP ${res.status}: ${errText.slice(0, 240)}`,
      };
    }

    const parsed = (await res.json().catch(() => ({}))) as { id?: string };
    return {
      ok: true,
      status: 'sent',
      provider: 'resend',
      messageId: parsed.id || null,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 'failed',
      provider: 'resend',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function processAuthenticatedWelcomeEmail(params: {
  user: SupabaseVerifiedUser;
  accessToken: string;
  authEvent?: WelcomeAuthEvent;
  requestOrigin?: string | null;
}): Promise<WelcomeEmailOutcome> {
  const { user, accessToken, authEvent = 'session_check', requestOrigin } = params;

  const existingPromise = inFlightUsers.get(user.id);
  if (existingPromise) {
    return existingPromise;
  }

  const work = (async (): Promise<WelcomeEmailOutcome> => {
    if (memoryDeliveredUsers.has(user.id)) {
      return {
        ok: true,
        status: 'already_sent',
        provider: 'none',
        reason: 'memory_dedupe',
      };
    }

    const recipientEmail = resolveVerifiedRecipientEmail(user);
    const authProvider =
      user.app_metadata?.provider ||
      (user.phone && !recipientEmail ? 'phone' : 'email');

    // Never guess or invent an email address (e.g., phone registration with no linked email)
    if (!recipientEmail) {
      await recordProfileWelcomeOutcome({
        userId: user.id,
        accessToken,
        recipientEmail: null,
        authProvider,
        status: 'skipped_no_email',
        provider: 'none',
        errorMessage: null,
      });
      return {
        ok: true,
        status: 'skipped_no_email',
        provider: 'none',
        reason: 'No verified or linked email address on account.',
      };
    }

    // Check if this event represents an actual new registration rather than ordinary sign-in
    const eligibility = isNewAccountWelcomeEligible(user, authEvent);
    if (!eligibility.eligible) {
      return {
        ok: true,
        status: 'skipped_existing_account',
        provider: 'none',
        reason: eligibility.reason,
      };
    }

    // Atomic persistent claim in Supabase profiles (falls back to in-memory lock if migration hasn't run yet)
    const claimResult = await claimProfileWelcomeSlot(user, accessToken);
    if (claimResult === 'already_sent') {
      memoryDeliveredUsers.add(user.id);
      return {
        ok: true,
        status: 'already_sent',
        provider: 'none',
        reason: 'already_recorded_in_profile',
      };
    }

    if (!isResendConfigured()) {
      logServerWarn(
        'auth.welcome_email',
        'RESEND_API_KEY is not configured; welcome email was not sent.',
        { userId: user.id }
      );
      await recordProfileWelcomeOutcome({
        userId: user.id,
        accessToken,
        recipientEmail,
        authProvider,
        status: 'not_configured',
        provider: 'none',
        errorMessage: 'RESEND_API_KEY missing in server environment.',
      });
      return {
        ok: false,
        status: 'not_configured',
        provider: 'none',
        reason: 'Welcome email provider is not configured.',
      };
    }

    const displayName = resolveUserDisplayName(user);
    const delivery = await sendWelcomeEmailViaResend({
      email: recipientEmail,
      displayName,
      requestOrigin,
    });

    if (delivery.ok && delivery.status === 'sent') {
      memoryDeliveredUsers.add(user.id);
      await recordProfileWelcomeOutcome({
        userId: user.id,
        accessToken,
        recipientEmail,
        authProvider,
        status: 'sent',
        provider: 'resend',
        messageId: delivery.messageId ?? null,
        errorMessage: null,
      });
      return {
        ok: true,
        status: 'sent',
        provider: 'resend',
        messageId: delivery.messageId ?? null,
      };
    }

    logServerError('auth.welcome_email', new Error(delivery.error || 'Welcome email delivery failed'), {
      userId: user.id,
      provider: delivery.provider,
    });

    await recordProfileWelcomeOutcome({
      userId: user.id,
      accessToken,
      recipientEmail,
      authProvider,
      status: delivery.status === 'not_configured' ? 'not_configured' : 'failed',
      provider: delivery.provider,
      messageId: null,
      errorMessage: delivery.error || 'Provider delivery failure',
    });

    return {
      ok: false,
      status: delivery.status === 'not_configured' ? 'not_configured' : 'failed',
      provider: delivery.provider,
      reason: delivery.error || 'Welcome email delivery failed.',
    };
  })();

  inFlightUsers.set(user.id, work);
  try {
    return await work;
  } finally {
    inFlightUsers.delete(user.id);
  }
}

export function __unsafeResetWelcomeEmailMemoryForTest(): void {
  inFlightUsers.clear();
  memoryDeliveredUsers.clear();
}

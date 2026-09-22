import { createClient } from '@supabase/supabase-js';

const supabaseUrlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKeyRaw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

function diagnoseConfig(url: string | undefined, key: string | undefined) {
  const urlPresent = !!url;
  const keyPresent = !!key;
  let keyType = 'missing';
  if (key) {
    if (key.startsWith('sb_publishable_')) keyType = 'publishable';
    else if (key.startsWith('sb_secret_')) keyType = 'secret (FORBIDDEN in browser)';
    else if (key.startsWith('eyJ')) keyType = 'legacy-jwt';
    else keyType = 'unknown';
  }
  let urlValid = false;
  let urlProjectRef = 'n/a';
  if (url) {
    urlValid = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) && !url.includes('/rest/v1') && !url.includes('/auth/v1');
    const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/);
    urlProjectRef = match ? match[1] : 'n/a';
  }
  let keyProjectRef = 'n/a';
  if (key && key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1]));
      keyProjectRef = payload.ref || 'n/a';
    } catch {
      keyProjectRef = 'unreadable';
    }
  }
  const mismatch =
    urlPresent &&
    keyPresent &&
    urlProjectRef !== 'n/a' &&
    keyProjectRef !== 'n/a' &&
    keyProjectRef !== 'unreadable' &&
    urlProjectRef !== keyProjectRef;

  if (!urlPresent || !keyPresent) {
    console.error(
      '[Supabase] Missing environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }
  if (url && !urlValid) {
    console.error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_URL must be the base project URL only (e.g. https://yourproject.supabase.co). It must NOT contain /rest/v1, /auth/v1, or trailing paths.'
    );
  }
  if (keyType === 'secret (FORBIDDEN in browser)') {
    console.error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a SECRET key (sb_secret_...). A secret/service-role key must NEVER be exposed to the browser. Use the Publishable key (sb_publishable_...) instead.'
    );
  }
  if (mismatch) {
    console.error(
      `[Supabase] URL project ref "${urlProjectRef}" does not match key project ref "${keyProjectRef}". The URL and API key must belong to the same Supabase project.`
    );
  }

  return { urlValid, keyType, mismatch };
}

const diag = diagnoseConfig(supabaseUrlRaw, supabaseAnonKeyRaw);

export const supabaseConfigError =
  !supabaseUrlRaw || !supabaseAnonKeyRaw || !diag.urlValid
    ? 'Supabase configuration is missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment.'
    : null;

export const supabaseUrl = (supabaseUrlRaw as string) || '';
export const supabaseAnonKey = (supabaseAnonKeyRaw as string) || '';

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Tests network reachability of the Supabase Auth endpoint.
 * Returns a structured result so callers can distinguish config errors,
 * network failures, and successful connectivity.
 */
export async function checkSupabaseConnectivity(): Promise<{
  ok: boolean;
  reason: 'config-missing' | 'url-invalid' | 'network-error' | 'server-error' | 'reachable';
  status?: number;
  detail: string;
}> {
  if (!supabaseUrlRaw || !supabaseAnonKeyRaw) {
    return { ok: false, reason: 'config-missing', detail: 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in the environment.' };
  }
  if (!diag.urlValid) {
    return { ok: false, reason: 'url-invalid', detail: 'NEXT_PUBLIC_SUPABASE_URL must be the base project URL (https://yourproject.supabase.co) without /rest/v1 or /auth/v1 paths.' };
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKeyRaw },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return { ok: true, reason: 'reachable', status: res.status, detail: 'Supabase Auth endpoint is reachable.' };
    }
    return { ok: false, reason: 'server-error', status: res.status, detail: `Supabase Auth endpoint returned HTTP ${res.status}.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network-error', detail: `Network request to Supabase Auth failed: ${msg}` };
  }
}

/**
 * Classifies an auth or database error into a safe, user-facing category.
 * Never returns raw SQL errors, stack traces, or credentials.
 */
export function classifyAuthError(error: { message?: string; code?: string }, context: 'auth' | 'profile'): string {
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';

  if (context === 'auth') {
    if (!supabaseUrlRaw || !supabaseAnonKeyRaw) {
      return 'Supabase is not configured. The environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Please redeploy the site after setting them.';
    }
    if (msg.includes('failed to fetch') || msg.includes('networkrequestfailed') || msg.includes('network error') || msg.includes('load failed')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }
    if (code === '401' || msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('wrong password') || msg.includes('wrong email')) {
      return 'Invalid email or password. Please try again.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Your email has not been confirmed. Please check your inbox for a confirmation link.';
    }
    if (code === '429' || msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
      return 'Too many login attempts. Please wait a minute before trying again.';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'The authentication service took too long to respond. Please try again.';
    }
    return error.message || 'Authentication failed. Please try again.';
  }

  // Profile errors
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  if (code === '42501' || code === 'PGRST301') {
    return 'Your account is authenticated, but your CRM profile could not be loaded due to a permissions issue. Please contact your administrator.';
  }
  return 'Unable to load your account profile. Please try again or contact your administrator.';
}

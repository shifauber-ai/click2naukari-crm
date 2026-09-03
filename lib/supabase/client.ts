import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

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

  if (typeof window !== 'undefined') {
    console.info('[Supabase Config]', {
      urlPresent,
      keyPresent,
      keyType,
      urlValid,
      urlProjectRef,
      keyProjectRef: keyType === 'legacy-jwt' ? keyProjectRef : 'n/a (publishable keys do not embed project ref)',
      urlKeyMismatch: mismatch,
    });
  }

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

const diag = diagnoseConfig(supabaseUrl, supabaseAnonKey);

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey || !diag.urlValid
    ? 'Supabase configuration is missing or invalid. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment.'
    : null;

export const supabase = createClient(
  (supabaseUrl as string) || 'https://placeholder.supabase.co',
  (supabaseAnonKey as string) || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUser() {
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  const response = NextResponse.next({ request: { headers: new Headers() } });

  const serverClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        ...(allCookies.length > 0
          ? {
              Authorization: `Bearer ${
                allCookies.find((c: { name: string; value: string }) =>
                  c.name.includes('sb-access-token')
                )?.value || ''
              }`,
            }
          : {}),
      },
    },
  });

  const {
    data: { user },
  } = await serverClient.auth.getUser();
  return { user, serverClient, response };
}

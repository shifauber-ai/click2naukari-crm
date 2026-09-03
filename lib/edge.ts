import { supabase } from "./supabase/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

export async function callEdgeFunction(
  name: string,
  body: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) {
    return { ok: false, error: "Not authenticated" };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

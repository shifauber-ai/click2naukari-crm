import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase/client";

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
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `Edge function returned non-JSON response (HTTP ${res.status})`,
      };
    }

    if (!res.ok) {
      const errMsg =
        (data as { error?: string; message?: string })?.error ||
        (data as { message?: string })?.message ||
        `Request failed (HTTP ${res.status})`;
      return { ok: false, error: errMsg, data };
    }

    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: msg };
  }
}

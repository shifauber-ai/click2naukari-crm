import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase/client";

export async function callEdgeFunction(
  name: string,
  body: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    return { ok: false, error: `Session error: ${sessionErr.message}` };
  }
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, error: "Admin session expired. Please login again." };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        ok: false,
        error: `Edge function returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
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
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Request timed out after 30 seconds. The server may be slow or unresponsive." };
    }
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: msg };
  }
}

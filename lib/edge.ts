import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase/client";

async function getValidSessionToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) {
    console.log("[callEdgeFunction] SESSION_FOUND");
    return sessionData.session.access_token;
  }

  console.log("[callEdgeFunction] SESSION_MISSING, attempting refresh");
  const { data: refreshData, error: refreshErr } =
    await supabase.auth.refreshSession();
  if (refreshErr) {
    console.log("[callEdgeFunction] SESSION_REFRESH_FAILED", refreshErr.message);
    return null;
  }
  if (refreshData.session?.access_token) {
    console.log("[callEdgeFunction] SESSION_REFRESHED");
    return refreshData.session.access_token;
  }

  console.log("[callEdgeFunction] SESSION_STILL_MISSING after refresh");
  return null;
}

export async function callEdgeFunction(
  name: string,
  body: unknown
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = await getValidSessionToken();
  if (!token) {
    return { ok: false, error: "Your admin session has expired. Please login again." };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    console.log(`[callEdgeFunction] EDGE_REQUEST ${name}`);
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
    clearTimeout(timeoutId);

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      console.log(`[callEdgeFunction] EDGE_RESPONSE non-JSON HTTP ${res.status}`);
      return {
        ok: false,
        error: `Edge function returned non-JSON response (HTTP ${res.status})`,
      };
    }

    console.log(`[callEdgeFunction] EDGE_RESPONSE HTTP ${res.status}`);

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
      return { ok: false, error: "Request timed out. Please try again." };
    }
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: msg };
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publicPaths = ["/crm/login", "/crm/register", "/crm/register-admin", "/crm/forgot-password", "/crm/reset-password"];
  if (!pathname.startsWith("/crm") || publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // The Supabase browser client persists sessions in localStorage, which the
  // server cannot read. Client-side layout components handle auth gating via
  // the AuthProvider. Here we only check the server-accessible cookie path so
  // that server-rendered deep links still get redirected when there is clearly
  // no session. If the cookie is absent we let the request through and let the
  // client-side guard redirect to login with the correct redirect param.
  const token = req.cookies.get("sb-access-token")?.value;
  if (!token) {
    return NextResponse.next();
  }

  // If we do have a server-readable token, verify it and enforce role routing.
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/crm/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await client
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    const url = req.nextUrl.clone();
    url.pathname = "/crm/login";
    url.searchParams.set("error", "inactive");
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/crm/admin") && profile.role !== "ADMIN") {
    const url = req.nextUrl.clone();
    url.pathname = "/crm/employee";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/crm/:path*"],
};

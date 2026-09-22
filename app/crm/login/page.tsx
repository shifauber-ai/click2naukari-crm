"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, supabaseConfigError, classifyAuthError } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Phone, LogIn, AlertCircle, Loader2, Shield, KeyRound, WifiOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.get("error") === "inactive") {
      setError("Your account has been deactivated. Contact your administrator.");
    } else if (params.get("error") === "expired") {
      setError("Your 3-day login session has expired. Please login again.");
    }
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: Check configuration
      if (supabaseConfigError) {
        setError(supabaseConfigError);
        console.error("[Login] Supabase config error:", supabaseConfigError);
        return;
      }

      // Step 2: Attempt sign-in directly — the Supabase JS client handles
      // connectivity internally. A separate pre-check fetch was causing
      // false "Failed to fetch" errors (AbortSignal.timeout not supported
      // in some browsers, browser extensions blocking raw fetch, etc.).
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        const userMsg = classifyAuthError(signInError, "auth");
        setError(userMsg);
        console.error("[Login] Auth error:", signInError.name, signInError.message, "code:", (signInError as { code?: string }).code);
        return;
      }

      if (!data.user) {
        setError("Login failed — no user returned. Please try again.");
        console.error("[Login] signInWithPassword returned no user");
        return;
      }

      console.log("[Login] Auth succeeded for user:", data.user.id);

      // Step 4: Verify session is established
      let sessionReady = !!data.session;
      if (!sessionReady) {
        const { data: sessionData } = await supabase.auth.getSession();
        sessionReady = !!sessionData.session;
      }
      if (!sessionReady) {
        setError("Authentication session could not be established. Please try again.");
        console.error("[Login] No session after sign-in");
        return;
      }

      // Step 5: Load CRM profile with one retry
      let profile: { role: string; is_active: boolean } | null = null;
      let profileError: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!result.error) {
          profile = result.data as { role: string; is_active: boolean } | null;
          break;
        }
        profileError = result.error;
        console.error(`[Login] Profile query attempt ${attempt + 1} failed:`, result.error.code, result.error.message);
        if (attempt === 0) {
          await supabase.auth.getSession();
        }
      }

      if (profileError) {
        setError(classifyAuthError(profileError, "profile"));
        return;
      }

      if (!profile) {
        setError("Your account is authenticated, but your CRM profile has not been configured. Please contact your administrator.");
        console.error("[Login] No profile row for user:", data.user.id);
        return;
      }

      if (!profile.is_active) {
        setError("Your account has been deactivated. Contact your administrator.");
        console.error("[Login] Profile inactive for user:", data.user.id);
        return;
      }

      console.log("[Login] Profile loaded, role:", profile.role);

      // Record login timestamp for the 72-hour session window
      try {
        localStorage.setItem("crm_login_timestamp", String(Date.now()));
      } catch {
        // localStorage may be unavailable in some contexts
      }

      const redirect = params.get("redirect");
      if (redirect && !redirect.includes("/crm/login")) {
        router.push(redirect);
      } else if (profile.role === "ADMIN" || profile.role === "MANAGER") {
        router.push("/crm/admin");
      } else {
        router.push("/crm/employee");
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
        setError("Unable to reach the authentication service. This could be a network issue or the Supabase project may be paused. Please try again in a moment.");
      } else {
        setError("An unexpected error occurred during login. Please try again.");
      }
      console.error("[Login] Unexpected exception:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@click2naukari.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error.includes("network") || error.includes("reach") || error.includes("connect") ? (
            <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
          </>
        ) : (
          <>
            <LogIn className="mr-2 h-4 w-4" /> Sign In
          </>
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Phone className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Click2Naukari</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your CRM workspace
          </p>
        </div>
        <Card className="border-border/60 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
        <div className="mt-6 flex items-center justify-center gap-4 text-center text-xs text-muted-foreground">
          <Link
            href="/crm/register-admin"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Shield className="h-3 w-3" /> Register as Admin
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <Link
            href="/crm/forgot-password"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <KeyRound className="h-3 w-3" /> Forgot Password?
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, supabaseConfigError } from "@/lib/supabase/client";
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
import { Phone, LogIn, AlertCircle, Loader2, Shield, KeyRound } from "lucide-react";

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
    }
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (supabaseConfigError) {
        setError(supabaseConfigError);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes("invalid api key")) {
          setError("The app could not authenticate with the server because the Supabase API key is missing, incorrect, or belongs to a different project. An administrator must check the NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables in the deployment settings, then redeploy.");
        } else {
          setError(signInError.message);
        }
        return;
      }

      if (!data.user) {
        console.error("[Auth] signInWithPassword returned no user but no error");
        setError("Login failed. Please try again.");
        return;
      }

      console.info("[Auth] signInWithPassword SUCCESS, user:", data.user.id);

      // signInWithPassword already sets the session internally. Verify it's
      // available before querying the profile, with a retry for environments
      // where the session propagation may lag (e.g. Vercel production).
      let sessionReady = !!data.session;
      if (!sessionReady) {
        const { data: sessionData } = await supabase.auth.getSession();
        sessionReady = !!sessionData.session;
      }
      if (!sessionReady) {
        console.error("[Auth] No session available after sign-in");
        await supabase.auth.signOut();
        setError("Authentication session could not be established. Please try again.");
        return;
      }

      // Query the profile with one retry. On Vercel, the auth token may not
      // be fully attached to the first REST call immediately after sign-in.
      console.info("[Auth] profile query START");
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
          console.info("[Auth] profile query SUCCESS, attempt:", attempt + 1);
          break;
        }
        profileError = result.error;
        console.error("[Auth] profile query FAILED attempt", attempt + 1, {
          code: result.error.code,
          message: result.error.message,
        });
        if (attempt === 0) {
          // Re-fetch the session to ensure the token is fresh for the retry.
          await supabase.auth.getSession();
        }
      }

      if (profileError) {
        await supabase.auth.signOut();
        const code = profileError.code || "";
        if (code === "42501" || code === "PGRST301") {
          setError("Profile access denied. Your account may not be fully configured. Please contact your administrator.");
        } else {
          setError("Unable to load your account profile. Please try again or contact your administrator.");
        }
        return;
      }

      if (!profile) {
        console.error("[Auth] No profile row found for user:", data.user.id);
        await supabase.auth.signOut();
        setError("No profile found for your account. Please contact your administrator to set up your account.");
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setError("Your account has been deactivated. Contact your administrator.");
        return;
      }

      const redirect = params.get("redirect");
      if (redirect && !redirect.includes("/crm/login")) {
        router.push(redirect);
      } else if (profile.role === "ADMIN") {
        router.push("/crm/admin");
      } else {
        router.push("/crm/employee");
      }
      router.refresh();
    } catch {
      setError("Unable to connect to the authentication server. Please try again.");
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
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
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
            href="/crm/register"
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

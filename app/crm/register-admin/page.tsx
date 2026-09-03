"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
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
import { Phone, Shield, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (supabaseConfigError) {
        setError(supabaseConfigError);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (msg.includes("already") || msg.includes("registered")) {
          setError("This email is already registered. Try signing in instead.");
        } else if (msg.includes("weak") || msg.includes("password")) {
          setError("Password is too weak. Use at least 8 characters with a mix of letters and numbers.");
        } else if (msg.includes("email")) {
          setError("Please enter a valid email address.");
        } else if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
          setError("Unable to connect to the authentication service. Please check your internet connection and try again.");
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (!data.user) {
        setError("Registration failed. Please try again.");
        return;
      }

      const { error: profileError } = await supabase.rpc("bootstrap_profile", {
        p_user_id: data.user.id,
        p_email: email,
        p_full_name: fullName,
        p_role: "ADMIN",
      });

      if (profileError) {
        setError("Your account was created but the admin profile could not be set up. Please contact support.");
        return;
      }

      router.push("/crm/admin");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed")) {
        setError("Unable to connect to the authentication service. Please check your internet connection and try again.");
      } else {
        setError("An unexpected error occurred during registration. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          placeholder="Your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
          </>
        ) : (
          <>
            <Shield className="mr-2 h-4 w-4" /> Create Admin Account
          </>
        )}
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/30 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Click2Naukari</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your admin account
          </p>
        </div>
        <Card className="border-border/60 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-xl">Create Admin Account</CardTitle>
            <CardDescription>
              Register your administrator account to access the CRM dashboard
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
              <RegisterForm />
            </Suspense>
          </CardContent>
        </Card>
        <div className="mt-6 flex items-center justify-center gap-4 text-center text-xs text-muted-foreground">
          <button
            onClick={() => router.push("/crm/login")}
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to login
          </button>
          <span className="text-muted-foreground/40">|</span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" /> Click2Naukari CRM
          </span>
        </div>
      </div>
    </div>
  );
}

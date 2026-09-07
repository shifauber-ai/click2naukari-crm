"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { Profile, Role } from "./types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// 72-hour session window in milliseconds
const SESSION_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const LOGIN_TIMESTAMP_KEY = "crm_login_timestamp";

function getLoginTimestamp(): number | null {
  try {
    const val = localStorage.getItem(LOGIN_TIMESTAMP_KEY);
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

function setLoginTimestamp(ts: number) {
  try {
    localStorage.setItem(LOGIN_TIMESTAMP_KEY, String(ts));
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

function clearLoginTimestamp() {
  try {
    localStorage.removeItem(LOGIN_TIMESTAMP_KEY);
  } catch {
    // ignore
  }
}

function isSessionExpired(): boolean {
  const ts = getLoginTimestamp();
  if (!ts) return false; // No timestamp means we can't enforce — let Supabase decide
  return Date.now() - ts > SESSION_MAX_AGE_MS;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const profileUidRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    // Avoid refetching the same user's profile.
    if (profileUidRef.current === uid) return;
    profileUidRef.current = uid;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at, updated_at")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) {
      setProfile(null);
      profileUidRef.current = null;
      return;
    }
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      profileUidRef.current = null;
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      // Check 72-hour session expiry on startup (covers browser/laptop reopen)
      if (data.session?.user && isSessionExpired()) {
        await supabase.auth.signOut();
        clearLoginTimestamp();
        setSession(null);
        setUser(null);
        setProfile(null);
        profileUidRef.current = null;
        setAuthError("Your 3-day login session has expired. Please login again.");
        setLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;

        // On SIGNED_IN, record the login timestamp for the 72-hour window
        if (event === "SIGNED_IN" && newSession?.user) {
          setLoginTimestamp(Date.now());
          setAuthError(null);
        }

        // On TOKEN_REFRESHED, check 72-hour expiry
        if (event === "TOKEN_REFRESHED" && newSession?.user && isSessionExpired()) {
          (async () => {
            await supabase.auth.signOut();
            clearLoginTimestamp();
            if (!mounted) return;
            setSession(null);
            setUser(null);
            setProfile(null);
            profileUidRef.current = null;
            setAuthError("Your 3-day login session has expired. Please login again.");
            setLoading(false);
          })();
          return;
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          loadProfile(newSession.user.id).finally(() => setLoading(false));
        } else {
          profileUidRef.current = null;
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Re-check 72-hour expiry when the tab/window regains focus (covers laptop
  // wake, browser reopen after close). setTimeout alone is unreliable because
  // the browser may be closed or sleeping when the timer would have fired.
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getSession();
      if (data.session?.user && isSessionExpired()) {
        await supabase.auth.signOut();
        clearLoginTimestamp();
        setSession(null);
        setUser(null);
        setProfile(null);
        profileUidRef.current = null;
        setAuthError("Your 3-day login session has expired. Please login again.");
        setLoading(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearLoginTimestamp();
    setProfile(null);
    setUser(null);
    setSession(null);
    profileUidRef.current = null;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, authError, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRole(): Role | null {
  const { profile } = useAuth();
  return profile?.role ?? null;
}

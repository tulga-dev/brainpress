"use client";

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: SupabaseUser;
}

const sessionStorageKey = "brainpress.supabase.session.v1";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
  };
}

export async function requestSupabaseMagicLink(email: string, redirectTo?: string) {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/otp`, {
    method: "POST",
    headers: supabaseHeaders(config.anonKey),
    body: JSON.stringify({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { msg?: string; message?: string; error_description?: string };
    throw new Error(payload.error_description || payload.message || payload.msg || "Supabase could not send the sign-in email.");
  }
}

export async function restoreSupabaseSession(): Promise<SupabaseSession | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  const redirected = await consumeSupabaseAuthRedirect();
  if (redirected) return redirected;

  const cached = loadCachedSupabaseSession();
  if (!cached) return null;

  const expiresSoon = cached.expiresAt ? cached.expiresAt - 60 <= Math.floor(Date.now() / 1000) : false;
  if (expiresSoon && cached.refreshToken) {
    return refreshSupabaseSession(cached.refreshToken).catch(() => {
      clearSupabaseSession();
      return null;
    });
  }

  const user = await fetchSupabaseUser(cached.accessToken).catch(() => null);
  if (!user) {
    clearSupabaseSession();
    return null;
  }
  const session = { ...cached, user };
  cacheSupabaseSession(session);
  return session;
}

export async function consumeSupabaseAuthRedirect(): Promise<SupabaseSession | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash.includes("access_token")) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  const refreshToken = params.get("refresh_token") || undefined;
  const expiresIn = Number(params.get("expires_in") || "0");
  const user = await fetchSupabaseUser(accessToken);
  const session: SupabaseSession = {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
    user,
  };
  cacheSupabaseSession(session);
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  return session;
}

export async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession> {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: supabaseHeaders(config.anonKey),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error("Supabase session refresh failed.");
  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user?: SupabaseUser;
  };
  const user = payload.user || (await fetchSupabaseUser(payload.access_token));
  const session: SupabaseSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
    expiresAt: payload.expires_in ? Math.floor(Date.now() / 1000) + payload.expires_in : undefined,
    user,
  };
  cacheSupabaseSession(session);
  return session;
}

export async function signOutSupabase(session: SupabaseSession | null) {
  if (!session || !isSupabaseConfigured()) {
    clearSupabaseSession();
    return;
  }
  const config = requireSupabaseConfig();
  await fetch(`${config.url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config.anonKey),
      Authorization: `Bearer ${session.accessToken}`,
    },
  }).catch(() => undefined);
  clearSupabaseSession();
}

export async function fetchSupabaseUser(accessToken: string): Promise<SupabaseUser> {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw new Error("Supabase session is not valid.");
  return (await response.json()) as SupabaseUser;
}

export function loadCachedSupabaseSession(): SupabaseSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(sessionStorageKey);
    return value ? (JSON.parse(value) as SupabaseSession) : null;
  } catch {
    return null;
  }
}

export function cacheSupabaseSession(session: SupabaseSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearSupabaseSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionStorageKey);
}

export function supabaseHeaders(anonKey: string) {
  return {
    apikey: anonKey,
    "Content-Type": "application/json",
  };
}

function requireSupabaseConfig() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return config;
}

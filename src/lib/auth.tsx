"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { setTokenProvider } from "./api";
import { buildAuthorizeUrl, decodeJwt, getOidcConfig, logoutUrl, type TokenSet } from "./oidc";

export interface Session {
  name: string;
  mode: "oidc" | "demo";
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
}

interface AuthApi {
  session: Session | null;
  ready: boolean;
  oidcEnabled: boolean;
  loginDemo: (name: string) => void;
  loginOidc: (returnTo?: string) => Promise<void>;
  completeOidc: (tokens: TokenSet) => void;
  logout: () => void;
}

const STORAGE_KEY = "subsidy.session";
const AuthContext = createContext<AuthApi | null>(null);

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt && session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* приватный режим браузера — сессия живёт только в памяти */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const oidc = useMemo(() => getOidcConfig(), []);

  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);

  useEffect(() => {
    setTokenProvider(() => session?.accessToken ?? null);
  }, [session]);

  const update = useCallback((next: Session | null) => {
    writeSession(next);
    setSession(next);
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      session,
      ready,
      oidcEnabled: oidc !== null,
      loginDemo: (name) => update({ name: name.trim(), mode: "demo" }),
      loginOidc: async (returnTo) => {
        if (!oidc) return;
        window.location.assign(await buildAuthorizeUrl(oidc, returnTo));
      },
      completeOidc: (tokens) => {
        const claims = decodeJwt(tokens.idToken ?? tokens.accessToken);
        const name = String(claims.name ?? claims.preferred_username ?? "Специалист");
        update({ name, mode: "oidc", ...tokens });
      },
      logout: () => {
        const idToken = session?.idToken;
        const wasOidc = session?.mode === "oidc";
        update(null);
        if (wasOidc && oidc) window.location.assign(logoutUrl(oidc, idToken));
      },
    }),
    [session, ready, oidc, update],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен вызываться внутри AuthProvider");
  return ctx;
}

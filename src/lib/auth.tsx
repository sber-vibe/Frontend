"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { setTokenProvider, setUnauthorizedHandler } from "./api";
import { buildAuthorizeUrl, decodeJwt, getOidcConfig, logoutUrl, type TokenSet } from "./oidc";

export type Role = "specialist" | "admin";

export interface Session {
  name: string;
  mode: "oidc" | "demo";
  /** Роли пользователя: из realm_access.roles токена Keycloak или выбранная при демо-входе. */
  roles?: Role[];
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
}

/** Роли из access token Keycloak. Только для показа интерфейса — доступ проверяет backend. */
export function rolesFromClaims(claims: Record<string, unknown>): Role[] {
  const realm = claims.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(realm?.roles) ? (realm.roles as unknown[]) : [];
  return (["specialist", "admin"] as const).filter((r) => roles.includes(r));
}

export function hasRole(session: Session | null, role: Role): boolean {
  // старые сессии без ролей — специалист
  return (session?.roles ?? ["specialist"]).includes(role);
}

interface AuthApi {
  session: Session | null;
  ready: boolean;
  oidcEnabled: boolean;
  loginDemo: (name: string, role?: Role) => void;
  loginOidc: (returnTo?: string) => Promise<void>;
  completeOidc: (tokens: TokenSet) => void;
  logout: () => void;
}

const STORAGE_KEY = "subsidy.session";
/** Пометка для страницы входа: сессия завершилась сама, а не по кнопке «Выйти». */
const EXPIRED_KEY = "subsidy.session.expired";

/** Прочитать и сбросить пометку об истёкшей сессии. */
export function takeSessionExpired(): boolean {
  try {
    const expired = sessionStorage.getItem(EXPIRED_KEY) === "1";
    sessionStorage.removeItem(EXPIRED_KEY);
    return expired;
  } catch {
    return false;
  }
}

function markSessionExpired() {
  try {
    sessionStorage.setItem(EXPIRED_KEY, "1");
  } catch {
    /* без пометки страница входа просто не покажет пояснение */
  }
}
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

  // Токен Keycloak истёк или отозван: завершаем сессию — рабочие страницы отправят на вход с возвратом назад.
  const expire = useCallback(() => {
    markSessionExpired();
    update(null);
  }, [update]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (session?.mode === "oidc") expire();
    });
  }, [session, expire]);

  useEffect(() => {
    if (session?.mode !== "oidc" || !session.expiresAt) return;
    const timer = setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session, expire]);

  const api = useMemo<AuthApi>(
    () => ({
      session,
      ready,
      oidcEnabled: oidc !== null,
      loginDemo: (name, role = "specialist") =>
        update({ name: name.trim(), mode: "demo", roles: role === "admin" ? ["specialist", "admin"] : ["specialist"] }),
      loginOidc: async (returnTo) => {
        if (!oidc) return;
        window.location.assign(await buildAuthorizeUrl(oidc, returnTo));
      },
      completeOidc: (tokens) => {
        const claims = decodeJwt(tokens.idToken ?? tokens.accessToken);
        const name = String(claims.name ?? claims.preferred_username ?? "Специалист");
        update({ name, mode: "oidc", roles: rolesFromClaims(decodeJwt(tokens.accessToken)), ...tokens });
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

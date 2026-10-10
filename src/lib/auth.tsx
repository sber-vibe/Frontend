"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { setTokenProvider, setUnauthorizedHandler } from "./api";
import { buildAuthorizeUrl, decodeJwt, getOidcConfig, logoutUrl, refreshTokens, type OidcConfig, type TokenSet } from "./oidc";

export type Role = "specialist" | "admin";

export interface Session {
  name: string;
  mode: "oidc" | "demo";
  /** Роли пользователя: из realm_access.roles токена Keycloak или выбранная при демо-входе. */
  roles?: Role[];
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

/** За сколько до истечения access token продлеваем его. */
const REFRESH_AHEAD_MS = 60 * 1000;

function canRefresh(session: Session, now = Date.now()): boolean {
  return Boolean(session.refreshToken) && (!session.refreshExpiresAt || session.refreshExpiresAt > now);
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
    // access token истёк, но сессию ещё можно продлить — восстановим её при загрузке
    if (session.expiresAt && session.expiresAt < Date.now() && !canRefresh(session)) return null;
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

async function renew(oidc: OidcConfig | null, session: Session): Promise<Session | null> {
  if (!oidc || !session.refreshToken || !canRefresh(session)) return null;
  try {
    const tokens = await refreshTokens(oidc, session.refreshToken);
    return { ...session, ...tokens, roles: rolesFromClaims(decodeJwt(tokens.accessToken)) };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const oidc = useMemo(() => getOidcConfig(), []);
  // Текущая сессия для api-клиента. Обновляется синхронно, до рендера страниц: иначе первые запросы
  // после перезагрузки уходят без токена, получают 401 и сбрасывают сессию.
  const current = useRef<Session | null>(null);

  const update = useCallback((next: Session | null) => {
    current.current = next;
    writeSession(next);
    setSession(next);
  }, []);

  // Сессия Keycloak завершена или токен отозван — рабочие страницы отправят на вход с возвратом назад.
  const expire = useCallback(() => {
    markSessionExpired();
    update(null);
  }, [update]);

  useEffect(() => {
    setTokenProvider(() => current.current?.accessToken ?? null);
    setUnauthorizedHandler((token) => {
      // 401 на устаревший токен (его уже сменили продлением) сессию не завершает
      const now = current.current;
      if (now?.mode === "oidc" && (!token || token === now.accessToken)) expire();
    });
  }, [expire]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      let next = readSession();
      if (next?.mode === "oidc" && next.expiresAt && next.expiresAt - Date.now() < REFRESH_AHEAD_MS) {
        next = await renew(oidc, next);
        if (!next) markSessionExpired();
      }
      if (cancelled) return;
      update(next);
      setReady(true);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [oidc, update]);

  // Продлеваем access token заранее; не удалось — сессия Keycloak завершена, отправляем на вход.
  useEffect(() => {
    if (session?.mode !== "oidc" || !session.expiresAt) return;
    const timer = setTimeout(
      async () => {
        const next = await renew(oidc, session);
        if (current.current !== session) return; // за это время вышли или вошли заново
        if (next) update(next);
        else expire();
      },
      Math.max(0, session.expiresAt - Date.now() - REFRESH_AHEAD_MS),
    );
    return () => clearTimeout(timer);
  }, [session, oidc, update, expire]);

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

/**
 * Минимальный OIDC-клиент (Authorization Code + PKCE) для Keycloak.
 * Включается, если заданы NEXT_PUBLIC_OIDC_ISSUER и NEXT_PUBLIC_OIDC_CLIENT_ID.
 */

export interface OidcConfig {
  issuer: string;
  clientId: string;
  scope: string;
}

export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.NEXT_PUBLIC_OIDC_ISSUER;
  const clientId = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID;
  if (!issuer || !clientId) return null;
  return { issuer: issuer.replace(/\/$/, ""), clientId, scope: "openid profile email" };
}

/**
 * Параметры PKCE хранятся в localStorage по state, а не в sessionStorage вкладки:
 * ссылка подтверждения почты из письма открывается в новой вкладке, и Keycloak завершает вход уже там.
 */
const PKCE_PREFIX = "subsidy.oidc.pkce.";
/** Сколько ждём возврата из Keycloak: регистрация с подтверждением почты занимает несколько минут. */
const PKCE_TTL_MS = 30 * 60 * 1000;

interface PendingLogin {
  verifier: string;
  returnTo: string;
  createdAt: number;
}

function dropExpiredLogins(now = Date.now()) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PKCE_PREFIX)) continue;
    try {
      const { createdAt } = JSON.parse(localStorage.getItem(key) ?? "") as PendingLogin;
      if (!(now - createdAt < PKCE_TTL_MS)) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
}

/** Забирает параметры входа по state — один раз: повторное использование кода невозможно. */
function takePendingLogin(state: string): PendingLogin | null {
  dropExpiredLogins();
  const key = PKCE_PREFIX + state;
  const raw = localStorage.getItem(key);
  localStorage.removeItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingLogin;
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function redirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

export async function buildAuthorizeUrl(cfg: OidcConfig, returnTo = "/checks"): Promise<string> {
  const verifier = randomString();
  const state = randomString(16);
  dropExpiredLogins();
  const pending: PendingLogin = { verifier, returnTo, createdAt: Date.now() };
  localStorage.setItem(PKCE_PREFIX + state, JSON.stringify(pending));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: cfg.scope,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${cfg.issuer}/protocol/openid-connect/auth?${params}`;
}

/** Вход нельзя завершить этим ответом — нужно начать заново (при активной сессии Keycloak это без пароля). */
export class LoginExpiredError extends Error {
  constructor() {
    super("Сессия входа устарела, попробуйте ещё раз");
    this.name = "LoginExpiredError";
  }
}

export interface TokenSet {
  accessToken: string;
  idToken?: string;
  expiresAt: number;
  /** Refresh token Keycloak: продлевает сессию без повторного входа (в том числе после обновления страницы). */
  refreshToken?: string;
  refreshExpiresAt?: number;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  expires_in: number;
  refresh_token?: string;
  refresh_expires_in?: number;
}

function toTokenSet(body: TokenResponse, now = Date.now()): TokenSet {
  return {
    accessToken: body.access_token,
    idToken: body.id_token,
    expiresAt: now + body.expires_in * 1000,
    refreshToken: body.refresh_token,
    // 0 — без ограничения (offline-токен)
    refreshExpiresAt: body.refresh_token && body.refresh_expires_in ? now + body.refresh_expires_in * 1000 : undefined,
  };
}

/** Обновить токены по refresh token. Ошибка — сессия Keycloak завершена, нужен вход. */
export async function refreshTokens(cfg: OidcConfig, refreshToken: string): Promise<TokenSet> {
  const response = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: cfg.clientId, refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error("Сессия завершена");
  return toTokenSet((await response.json()) as TokenResponse);
}

export async function exchangeCode(cfg: OidcConfig, code: string, state: string): Promise<{ tokens: TokenSet; returnTo: string }> {
  // state не найден: вход начат в другом браузере, просрочен или код уже использован
  const pending = takePendingLogin(state);
  if (!pending) throw new LoginExpiredError();
  const { verifier, returnTo } = pending;

  const response = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error("Сервер авторизации отклонил вход");
  return {
    tokens: toTokenSet((await response.json()) as TokenResponse),
    returnTo: returnTo.startsWith("/") ? returnTo : "/checks",
  };
}

/** Читает claims из JWT без проверки подписи — только для отображения имени (подпись проверяет backend). */
export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function logoutUrl(cfg: OidcConfig, idToken?: string): string {
  const params = new URLSearchParams({ client_id: cfg.clientId, post_logout_redirect_uri: `${window.location.origin}/login` });
  if (idToken) params.set("id_token_hint", idToken);
  return `${cfg.issuer}/protocol/openid-connect/logout?${params}`;
}

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

const PKCE_KEY = "subsidy.oidc.pkce";

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
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo }));
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

export interface TokenSet {
  accessToken: string;
  idToken?: string;
  expiresAt: number;
}

export async function exchangeCode(cfg: OidcConfig, code: string, state: string): Promise<{ tokens: TokenSet; returnTo: string }> {
  const saved = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (!saved) throw new Error("Сессия входа устарела, попробуйте ещё раз");
  const { verifier, state: expected, returnTo } = JSON.parse(saved) as { verifier: string; state: string; returnTo: string };
  if (state !== expected) throw new Error("Неверный параметр state — вход отклонён");

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
  const body = (await response.json()) as { access_token: string; id_token?: string; expires_in: number };
  return {
    tokens: { accessToken: body.access_token, idToken: body.id_token, expiresAt: Date.now() + body.expires_in * 1000 },
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

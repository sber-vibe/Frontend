import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCode, LoginExpiredError, type OidcConfig } from "./oidc";

const cfg: OidcConfig = { issuer: "http://kc/realms/subsidy", clientId: "subsidy-frontend", scope: "openid" };

function stateOf(url: string): string {
  return new URL(url).searchParams.get("state")!;
}

function mockToken() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(JSON.stringify({ access_token: "a.b.c", id_token: "i.d.t", expires_in: 300 })));
}

describe("oidc: PKCE между вкладками", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("завершает вход в другой вкладке — например, по ссылке подтверждения из письма", async () => {
    const state = stateOf(await buildAuthorizeUrl(cfg, "/checks/new"));
    sessionStorage.clear(); // новая вкладка: своего sessionStorage нет
    const fetchSpy = mockToken();
    const { returnTo } = await exchangeCode(cfg, "code-1", state);
    expect(returnTo).toBe("/checks/new");
    const body = new URLSearchParams(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.get("code_verifier")).toBeTruthy();
  });

  it("код можно обменять только один раз", async () => {
    const state = stateOf(await buildAuthorizeUrl(cfg));
    mockToken();
    await exchangeCode(cfg, "code-1", state);
    await expect(exchangeCode(cfg, "code-1", state)).rejects.toBeInstanceOf(LoginExpiredError);
  });

  it("не принимает чужой или просроченный state", async () => {
    await expect(exchangeCode(cfg, "code", "unknown")).rejects.toBeInstanceOf(LoginExpiredError);

    const now = Date.now();
    const state = stateOf(await buildAuthorizeUrl(cfg));
    vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60 * 1000);
    await expect(exchangeCode(cfg, "code", state)).rejects.toBeInstanceOf(LoginExpiredError);
  });

  it("несколько начатых входов не мешают друг другу", async () => {
    const first = stateOf(await buildAuthorizeUrl(cfg, "/a"));
    const second = stateOf(await buildAuthorizeUrl(cfg, "/b"));
    mockToken();
    expect((await exchangeCode(cfg, "c1", first)).returnTo).toBe("/a");
    expect((await exchangeCode(cfg, "c2", second)).returnTo).toBe("/b");
  });
});
